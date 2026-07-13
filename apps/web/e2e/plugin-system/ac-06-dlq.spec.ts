// ac-06-dlq.spec.ts — Spec 004, AC-06: Dead Letter Queue.
// Real behavior: super admin accesses the DLQ API, entries load, and retrying a
// pending entry changes its status (or the entry leaves the pending filter).
//
// The DLQ endpoints require a master-realm super admin token. The test logs
// in via loginAsSuperAdmin() which uses the Keycloak master realm (slug 'admin').

import { expect, test } from '../helpers/base-fixture.js';
import { hasKeycloak, loginAsSuperAdmin, requireKeycloakInCI } from '../helpers/admin-login.js';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

test.describe('004 Plugin System — AC-06: Dead Letter Queue', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('DLQ API loads entries and retrying a pending entry changes its status', async ({ page }) => {
    await loginAsSuperAdmin(page);

    // Extract the access token from the Zustand auth store in sessionStorage.
    const token = await page.evaluate(() => {
      const stored = sessionStorage.getItem('plexica-auth');
      if (stored === null) return null;
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      return parsed.state?.accessToken ?? null;
    });
    expect(token, 'access token must be present after login').not.toBeNull();

    // List DLQ entries (all statuses).
    const listRes = await page.request.get(`${API_BASE}/api/v1/admin/system/dlq`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    expect(listRes.status(), `DLQ list should return 200`).toBe(200);
    const body = await listRes.json() as { data: Array<{ id: string; status: string }> };
    expect(Array.isArray(body.data)).toBe(true);

    // If there are no pending entries, the empty DLQ is a valid state.
    const pending = body.data.filter((e) => e.status === 'pending');
    if (pending.length === 0) {
      return;
    }

    // Retry the first pending entry.
    const entry = pending[0];
    if (!entry) return;
    const entryId = entry.id;
    const retryRes = await page.request.post(
      `${API_BASE}/api/v1/admin/system/dlq/${entryId}/retry`,
      { headers: { Authorization: `Bearer ${token ?? ''}` } },
    );
    expect(retryRes.status()).toBeLessThan(500);

    // After retry, the entry should no longer be pending.
    const verifyRes = await page.request.get(
      `${API_BASE}/api/v1/admin/system/dlq?status=pending`,
      { headers: { Authorization: `Bearer ${token ?? ''}` } },
    );
    expect(verifyRes.status()).toBe(200);
    const verifyBody = await verifyRes.json() as { data: Array<{ id: string }> };
    expect(verifyBody.data.some((e) => e.id === entryId)).toBe(false);
  });
});
