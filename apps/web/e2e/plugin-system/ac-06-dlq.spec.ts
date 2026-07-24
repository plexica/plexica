import crypto from 'node:crypto';

import { createConsumer } from '../../../../services/core-api/src/lib/kafka.js';
import { getE2eApiToken } from '../../../../e2e/keycloak/ephemeral-client.js';
import { expect, test } from '../helpers/base-fixture.js';
import { loginAsAdmin, uniqueName } from '../helpers/admin-login.js';
import {
  createWorkspaceFixture,
  ensureCrmInstalled,
  getBrowserToken,
} from '../helpers/plugin-fixtures.js';

import type { APIRequestContext } from '@playwright/test';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';
const createdWorkspaceIds: string[] = [];

interface TopicProbe {
  next: Promise<Record<string, unknown>>;
  stop: () => Promise<void>;
}

async function getHandlerAttempts(
  request: APIRequestContext,
  token: string,
  installId: string,
  workspaceId: string
): Promise<number> {
  const response = await request.get(
    `${API_BASE}/api/v1/plugins/${installId}/proxy/_plexica/event/attempts/${workspaceId}`,
    { headers: { Authorization: `Bearer ${token}`, 'X-Plexica-Workspace-Id': workspaceId } }
  );
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { count: number }).count;
}

async function startTopicProbe(
  topic: string,
  predicate: (payload: Record<string, unknown>) => boolean
): Promise<TopicProbe> {
  const consumer = createConsumer(`e2e-probe-${crypto.randomUUID()}`);
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });
  let resolveMessage!: (payload: Record<string, unknown>) => void;
  const message = new Promise<Record<string, unknown>>((resolve) => {
    resolveMessage = resolve;
  });
  await consumer.run({
    eachMessage: async ({ message: kafkaMessage }) => {
      const payload = JSON.parse(kafkaMessage.value?.toString() ?? '{}') as Record<string, unknown>;
      if (predicate(payload)) resolveMessage(payload);
    },
  });
  return {
    next: Promise.race([
      message,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`No ${topic} event`)), 10_000)
      ),
    ]),
    stop: () => consumer.disconnect(),
  };
}

async function findDlqEntry(
  request: APIRequestContext,
  token: string,
  workspaceId: string,
  entryId?: string
): Promise<{ id: string; eventId: string; retryCount: number; status: string } | undefined> {
  const response = await request.get(`${API_BASE}/api/v1/admin/system/dlq?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) return undefined;
  const body = (await response.json()) as {
    data: Array<{
      id: string;
      eventId: string;
      retryCount: number;
      status: string;
      payload: { payload?: { id?: string } };
    }>;
  };
  return body.data.find(
    (entry) =>
      entry.payload.payload?.id === workspaceId && (entryId === undefined || entry.id === entryId)
  );
}

test.describe('004 Plugin System - AC-06: Dead Letter Queue', () => {
  test.afterEach(() => {
    createdWorkspaceIds.splice(0);
  });

  test('failed Kafka delivery retries three times, enters DLQ, and retry republishes original topic', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await loginAsAdmin(page);
    const token = await getBrowserToken(page);
    const installId = await ensureCrmInstalled(page, token);
    const superToken = await getE2eApiToken();
    let workspaceId = '';
    const dlqProbe = await startTopicProbe(
      'plexica.plugin.dlq',
      (message) => message.type === 'plexica.plugin.delivery.failed'
    );
    workspaceId = await createWorkspaceFixture(page, token, uniqueName('e2e-dlq-failure'));
    createdWorkspaceIds.push(workspaceId);

    const dlqMessage = await dlqProbe.next;
    await dlqProbe.stop();
    expect(dlqMessage).toMatchObject({
      type: 'plexica.plugin.delivery.failed',
      schemaVersion: 1,
      encryption: { algorithm: 'A256GCM' },
    });
    expect(dlqMessage).toHaveProperty('ciphertext');
    expect(dlqMessage).not.toHaveProperty('payload');
    await expect
      .poll(() => getHandlerAttempts(request, token, installId, workspaceId), {
        timeout: 10_000,
      })
      .toBe(3);
    await expect
      .poll(() => findDlqEntry(request, superToken, workspaceId), {
        timeout: 10_000,
      })
      .toMatchObject({ retryCount: 3, status: 'pending' });
    const entry = await findDlqEntry(request, superToken, workspaceId);
    expect(entry).toBeDefined();

    const originalProbe = await startTopicProbe(
      'plexica.workspace.created',
      (message) => message.eventId === entry!.eventId
    );
    const retry = await request.post(`${API_BASE}/api/v1/admin/system/dlq/${entry!.id}/retry`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(retry.status()).toBe(200);
    expect(await originalProbe.next).toMatchObject({
      eventId: entry!.eventId,
      schemaVersion: 1,
      encryption: { algorithm: 'A256GCM' },
    });
    await originalProbe.stop();
    await expect
      .poll(() => findDlqEntry(request, superToken, workspaceId, entry!.id))
      .toMatchObject({
        id: entry!.id,
        status: 'retried',
      });
  });

  test('super admin dismisses a real failed-consumer DLQ entry', async ({ page, request }) => {
    test.setTimeout(180_000);
    await loginAsAdmin(page);
    const token = await getBrowserToken(page);
    await ensureCrmInstalled(page, token);
    const workspaceId = await createWorkspaceFixture(page, token, uniqueName('e2e-dlq-failure'));
    createdWorkspaceIds.push(workspaceId);
    const superToken = await getE2eApiToken();
    await expect
      .poll(() => findDlqEntry(request, superToken, workspaceId), {
        timeout: 10_000,
      })
      .toMatchObject({ retryCount: 3, status: 'pending' });
    const entry = await findDlqEntry(request, superToken, workspaceId);

    const dismiss = await request.post(`${API_BASE}/api/v1/admin/system/dlq/${entry!.id}/dismiss`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(dismiss.status()).toBe(200);
    await expect
      .poll(() => findDlqEntry(request, superToken, workspaceId, entry!.id))
      .toMatchObject({
        id: entry!.id,
        status: 'dismissed',
      });
  });
});
