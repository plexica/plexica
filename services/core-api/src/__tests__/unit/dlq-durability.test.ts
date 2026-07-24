import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureKey: vi.fn(),
  getKey: vi.fn(),
}));

vi.mock('../../events/event-key-service.js', () => ({
  ensureTenantEventKey: mocks.ensureKey,
  getTenantEventKey: mocks.getKey,
}));
vi.mock('../../lib/database.js', () => ({ prisma: {} }));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { dlqDedupeKey, dlqPayloadSchema } from '../../events/dlq-contract.js';
import { encryptDomainEvent } from '../../events/event-crypto.js';
import { buildDomainEvent } from '../../events/event-envelope.js';
import { handleDlqMessage, persistDlqEntry } from '../../modules/plugin/events/dlq-consumer.js';
import { dismissDlqEntry, moveToDlq, retryDlqEntry } from '../../modules/plugin/events/dlq.service.js';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const INSTALL_ID = '20000000-0000-4000-8000-000000000002';
const PLUGIN_ID = '30000000-0000-4000-8000-000000000003';
const EVENT_ID = '40000000-0000-4000-8000-000000000004';
const KEY = Buffer.alloc(32, 7);
const SOURCE = { topic: 'plexica.workspace.created', partition: 1, offset: '42' };

function event() {
  return buildDomainEvent({
    eventId: EVENT_ID,
    type: 'plexica.workspace.created',
    tenantId: TENANT_ID,
    producer: { kind: 'core', id: 'core' },
    correlationId: EVENT_ID,
    payload: { name: 'ciphertext-only' },
  });
}

function payload() {
  return dlqPayloadSchema.parse({
    tenantId: TENANT_ID,
    installId: INSTALL_ID,
    pluginId: PLUGIN_ID,
    event: event(),
    errorCode: 'PLUGIN_DELIVERY_FAILED',
    retryCount: 3,
    source: SOURCE,
  });
}

function fakeClient(initialStatus = 'pending') {
  const state = {
    id: '50000000-0000-4000-8000-000000000005',
    tenantId: TENANT_ID,
    eventId: EVENT_ID,
    eventType: event().type,
    payload: event(),
    originalTopic: SOURCE.topic,
    originalPartition: SOURCE.partition,
    retryCount: 3,
    status: initialStatus,
    resolvedAt: null as Date | null,
  };
  interface UpdateInput {
    where: {
      status?: string;
      resolvedAt?: Date;
      OR?: Array<{ status: string }>;
    };
    data: { status: string; resolvedAt: Date | null; retryCount?: unknown };
  }
  const updateMany = vi.fn(async ({ where, data }: UpdateInput) => {
    const statusMatch = !where.status || state.status === where.status;
    const claimMatch = !where.OR || where.OR.some((item) => item.status === state.status);
    const timeMatch = !where.resolvedAt || state.resolvedAt?.getTime() === where.resolvedAt.getTime();
    if (!statusMatch || !claimMatch || !timeMatch) return { count: 0 };
    state.status = data.status;
    state.resolvedAt = data.resolvedAt;
    if (data.retryCount) state.retryCount++;
    return { count: 1 };
  });
  const findUnique = vi.fn(async () => ({ ...state }));
  return {
    state,
    client: {
      deadLetterQueue: { updateMany, findUnique },
      tenant: { findUnique: vi.fn().mockResolvedValue({ status: 'active' }) },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureKey.mockResolvedValue({ keyVersion: 1, key: KEY });
  mocks.getKey.mockResolvedValue(KEY);
});

describe('encrypted durable DLQ', () => {
  it('publishes ciphertext with tenant ownership and source coordinates', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const db = { tenant: { findUnique: vi.fn().mockResolvedValue({ status: 'active' }) } };
    await moveToDlq(payload(), db as never, send);
    const [topic, wire, options] = send.mock.calls[0]!;
    expect(topic).toBe('plexica.plugin.dlq');
    expect(wire).toMatchObject({ eventId: EVENT_ID, tenantId: TENANT_ID, schemaVersion: 1 });
    expect(JSON.stringify(wire)).not.toContain('ciphertext-only');
    expect(options.headers).toMatchObject({
      'plugin-install-id': INSTALL_ID,
      'original-offset': SOURCE.offset,
    });
  });

  it('uses the database conflict arbiter for concurrent bridge dedupe', async () => {
    let inserted = false;
    const db = {
      $transaction: vi.fn(async (task: (tx: unknown) => Promise<boolean>) => task({
        $queryRaw: vi.fn().mockResolvedValue([{ status: 'active' }]),
        $executeRaw: vi.fn(async () => {
          if (inserted) return 0;
          inserted = true;
          return 1;
        }),
      })),
    };
    const results = await Promise.all([
      persistDlqEntry(db as never, payload()),
      persistDlqEntry(db as never, payload()),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it('decrypts and validates a v1 DLQ envelope before persistence', async () => {
    const outer = buildDomainEvent({
      eventId: EVENT_ID,
      type: 'plexica.plugin.delivery.failed',
      tenantId: TENANT_ID,
      producer: { kind: 'core', id: 'core' },
      correlationId: EVENT_ID,
      causationId: EVENT_ID,
      payload: payload() as never,
    });
    const execute = vi.fn().mockResolvedValue(1);
    const db = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ status: 'active' }) },
      $transaction: vi.fn(async (task: (tx: unknown) => Promise<boolean>) => task({
        $queryRaw: vi.fn().mockResolvedValue([{ status: 'active' }]),
        $executeRaw: execute,
      })),
    };
    await expect(handleDlqMessage(db as never, encryptDomainEvent(outer, 1, KEY))).resolves.toBe(true);
  });

  it('retries with the original stable event ID, tenant key, and partition', async () => {
    const { client, state } = fakeClient();
    const send = vi.fn().mockResolvedValue(undefined);
    await retryDlqEntry(client as never, state.id, new Date(), send);
    expect(send.mock.calls[0]![1]).toMatchObject({ eventId: EVENT_ID, tenantId: TENANT_ID });
    expect(send.mock.calls[0]![2]).toMatchObject({ partition: SOURCE.partition });
    expect(state.status).toBe('retried');
  });

  it('permits only one concurrent retry or dismiss claim', async () => {
    const { client, state } = fakeClient();
    let release!: () => void;
    const send = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const retry = retryDlqEntry(client as never, state.id, new Date(), send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    await expect(dismissDlqEntry(client as never, state.id)).rejects.toMatchObject({ statusCode: 409 });
    release();
    await retry;
  });

  it('derives the specified stable coordinate dedupe key', () => {
    expect(dlqDedupeKey(INSTALL_ID, SOURCE)).toMatch(/^[a-f0-9]{64}$/);
    expect(dlqDedupeKey(INSTALL_ID, SOURCE)).toBe(dlqDedupeKey(INSTALL_ID, SOURCE));
  });
});
