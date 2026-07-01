// ac-07-database-isolation.spec.ts — Spec 004, AC-07: Database Isolation.
// Real behavior: a plugin's getDb() can only access its declared tables.
// Cross-workspace data isolation: contacts in workspace A are not visible
// from workspace B.
//
// This test requires the CRM example backend to be running alongside the API
// (examples/plugins/crm), which is NOT deployed in CI. The test only runs
// when PLAYWRIGHT_CRM_BACKEND_URL is set (local dev with CRM running).
//
// When the CRM backend is absent the proxy returns 404 (no backend registered),
// so this test skips by default in CI.

import { expect, test } from '../helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
} from '../helpers/admin-login.js';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';
const CRM_BACKEND_URL = process.env['PLAYWRIGHT_CRM_BACKEND_URL'] ?? '';
const hasCrmBackend = CRM_BACKEND_URL.length > 0;
const WORKSPACE_A = process.env['PLAYWRIGHT_WORKSPACE_A_ID'] ?? '00000000-0000-0000-0000-000000000001';
const WORKSPACE_B = process.env['PLAYWRIGHT_WORKSPACE_B_ID'] ?? '00000000-0000-0000-0000-000000000002';

test.describe('004 Plugin System — AC-07: Database Isolation', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');
  // CRM backend is only available when running locally with the CRM example app.
  // CI does not deploy the CRM service, making the proxy return 404.
  test.skip(!hasCrmBackend, 'Requires CRM backend running (PLAYWRIGHT_CRM_BACKEND_URL)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('contacts created in workspace A are NOT visible from workspace B', async ({ page }) => {
    await loginAsAdmin(page);

    const token = await page.evaluate(() => {
      const stored = sessionStorage.getItem('plexica-auth');
      if (stored === null) return null;
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      return parsed.state?.accessToken ?? null;
    });
    expect(token, 'access token must be present after login').not.toBeNull();

    // Find the CRM installation.
    const listRes = await page.request.get(`${API_BASE}/api/v1/plugins/installed`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    expect(listRes.status()).toBe(200);
    const installations = await listRes.json();
    const crm = (installations as Array<{ pluginSlug?: string; id?: string; status?: string }>)
      .find((i) => i.pluginSlug === 'crm' && i.status !== 'uninstalled');
    if (!crm || !crm.id) {
      test.skip(true, 'CRM plugin must be installed to run this test');
      return;
    }
    const installId = crm.id;

    // Create a contact in workspace A.
    const uniqueSuffix = `iso-${Date.now()}`;
    const createRes = await page.request.post(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`,
      {
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
          'X-Plexica-Workspace-Id': WORKSPACE_A,
        },
        data: { name: `IsolationA-${uniqueSuffix}`, email: `a-${uniqueSuffix}@example.com` },
      },
    );
    expect(createRes.status(), 'contact create in workspace A should succeed').toBe(201);

    // List contacts from workspace B — must NOT include the workspace A contact.
    const listBRes = await page.request.get(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`,
      {
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'X-Plexica-Workspace-Id': WORKSPACE_B,
        },
      },
    );
    expect(listBRes.status()).toBe(200);
    const contactsBText = await listBRes.text();
    const contactsB = (contactsBText ? JSON.parse(contactsBText) : []) as Array<{ name: string }>;
    expect(
      contactsB.some((c) => c.name.includes(uniqueSuffix)),
      'workspace B must not see workspace A contacts (cross-workspace isolation)'
    ).toBe(false);

    // List contacts from workspace A — the created contact MUST be present.
    const listARes = await page.request.get(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`,
      {
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'X-Plexica-Workspace-Id': WORKSPACE_A,
        },
      },
    );
    expect(listARes.status()).toBe(200);
    const contactsAText = await listARes.text();
    const contactsA = (contactsAText ? JSON.parse(contactsAText) : []) as Array<{ name: string }>;
    expect(
      contactsA.some((c) => c.name.includes(uniqueSuffix)),
      'workspace A must see its own contact'
    ).toBe(true);
  });
});
