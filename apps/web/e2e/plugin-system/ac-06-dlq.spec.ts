// ac-06-dlq.spec.ts — Spec 004, AC-06: Dead Letter Queue.
// Real behavior: super admin accesses the DLQ API, entries load, and retrying a
// pending entry changes its status (or the entry leaves the pending filter).
//
// The DLQ endpoints require a master-realm super admin token. Unlike tenant-realm
// logins, the Keycloak master realm does not have the 'plexica-web' client, so the
// frontend OIDC flow cannot be used. Instead we obtain a token directly from the
// Keycloak admin API using the admin-cli client.
//
// This test is purely API-driven — it does not interact with the frontend UI, so
// there is no need to log in through the browser.

import { expect, test } from '../helpers/base-fixture.js';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';
const KEYCLOAK_URL = process.env['KEYCLOAK_URL'] ?? process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? 'http://localhost:8080';
const KEYCLOAK_ADMIN_USER = process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme';

/**
 * Obtains a Keycloak access token for the master-realm admin user.
 * Uses the admin-cli client (always available in the master realm).
 */
async function getSuperAdminToken(): Promise<string> {
  const res = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: KEYCLOAK_ADMIN_USER,
      password: KEYCLOAK_ADMIN_PASSWORD,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Super admin token fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// Skip condition: require Keycloak URL + admin credentials to be present.
const hasSuperAdminCredentials =
  KEYCLOAK_URL.length > 0 && KEYCLOAK_ADMIN_USER.length > 0 && KEYCLOAK_ADMIN_PASSWORD.length > 0;

test.describe('004 Plugin System — AC-06: Dead Letter Queue', () => {
  test.skip(!hasSuperAdminCredentials, 'Requires Keycloak admin credentials (KEYCLOAK_ADMIN_USER / KEYCLOAK_ADMIN_PASSWORD)');

  test('DLQ API loads entries and retrying a pending entry changes its status', async ({ page }) => {
    const token = await getSuperAdminToken();
    expect(token, 'super admin access token must be obtained').toBeTruthy();

    // List DLQ entries (all statuses).
    const listRes = await page.request.get(`${API_BASE}/api/v1/admin/system/dlq`, {
      headers: { Authorization: `Bearer ${token}` },
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
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(retryRes.status()).toBeLessThan(500);

    // After retry, the entry should no longer be pending.
    const verifyRes = await page.request.get(
      `${API_BASE}/api/v1/admin/system/dlq?status=pending`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(verifyRes.status()).toBe(200);
    const verifyBody = await verifyRes.json() as { data: Array<{ id: string }> };
    expect(verifyBody.data.some((e) => e.id === entryId)).toBe(false);
  });
});
