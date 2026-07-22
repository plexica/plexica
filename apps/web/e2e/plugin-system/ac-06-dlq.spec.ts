// ac-06-dlq.spec.ts — Spec 004, AC-06: Dead Letter Queue.
// Real behavior: a deterministic pending entry is retried through the real
// super-admin API and Kafka producer, then persists as retried.
//
// This test obtains a fresh token from the random, narrowly scoped client
// created by global setup and removed by global teardown.
//
// This test is purely API-driven — it does not interact with the frontend UI, so
// there is no need to log in through the browser.

import { expect, test } from '../helpers/base-fixture.js';
import { getE2eApiToken } from '../../../../e2e/keycloak/ephemeral-client.js';
import {
  deleteDlqFixture,
  DLQ_ENTRY_FIXTURE_ID,
  resetPendingDlqFixture,
} from '../../../../e2e/fixtures/core-fixtures.js';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

test.describe('004 Plugin System — AC-06: Dead Letter Queue', () => {
  test.beforeEach(() => resetPendingDlqFixture());
  test.afterEach(() => deleteDlqFixture());

  test('DLQ API loads entries and retrying a pending entry changes its status', async ({
    request,
  }) => {
    const token = await getE2eApiToken();
    expect(token, 'super admin access token must be obtained').toBeTruthy();
    const headers = { Authorization: `Bearer ${token}` };

    const listRes = await request.get(
      `${API_BASE}/api/v1/admin/system/dlq?status=pending&pageSize=100`,
      { headers }
    );
    expect(listRes.status(), 'pending DLQ list should return 200').toBe(200);
    const before = (await listRes.json()) as {
      data: Array<{ id: string; status: string; resolvedAt: string | null }>;
    };
    expect(before.data).toContainEqual(
      expect.objectContaining({
        id: DLQ_ENTRY_FIXTURE_ID,
        status: 'pending',
        resolvedAt: null,
      })
    );

    const retryRes = await request.post(
      `${API_BASE}/api/v1/admin/system/dlq/${DLQ_ENTRY_FIXTURE_ID}/retry`,
      { headers }
    );
    expect(retryRes.status(), 'DLQ retry should return the documented 200').toBe(200);
    expect(await retryRes.json()).toEqual({ status: 'retried' });

    const verifyRes = await request.get(`${API_BASE}/api/v1/admin/system/dlq?pageSize=100`, {
      headers,
    });
    expect(verifyRes.status()).toBe(200);
    const after = (await verifyRes.json()) as {
      data: Array<{ id: string; status: string; resolvedAt: string | null }>;
    };
    const fixture = after.data.find((entry) => entry.id === DLQ_ENTRY_FIXTURE_ID);
    expect(fixture).toMatchObject({ id: DLQ_ENTRY_FIXTURE_ID, status: 'retried' });
    expect(fixture?.resolvedAt).not.toBeNull();
  });
});
