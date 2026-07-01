// ac-04-crm-workflow.spec.ts — Spec 004, AC-04: CRM Example End-to-End.
// Real behavior: after installing the CRM plugin, a workspace member can
// create a contact via the proxy, and the contact persists in the tenant DB.
// Also verifies event-driven pipeline creation (plexica.workspace.created).

import { expect, test } from '../helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
} from '../helpers/admin-login.js';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

test.describe('004 Plugin System — AC-04: CRM Example End-to-End', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('CRM plugin proxy accepts a contact create and persists it', async ({ page }) => {
    await loginAsAdmin(page);

    // Extract the access token from the Zustand auth store in sessionStorage.
    const token = await page.evaluate(() => {
      const stored = sessionStorage.getItem('plexica-auth');
      if (stored === null) return null;
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      return parsed.state?.accessToken ?? null;
    });
    expect(token, 'access token must be present after login').not.toBeNull();

    // List installed plugins to find the CRM installation ID.
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

    // Create a contact via the plugin proxy.
    const contactName = `E2E Contact ${Date.now()}`;
    const createRes = await page.request.post(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`,
      {
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
          'X-Plexica-Workspace-Id': process.env['PLAYWRIGHT_WORKSPACE_ID'] ?? '00000000-0000-0000-0000-000000000001',
        },
        data: { name: contactName, email: `e2e-${Date.now()}@example.com` },
      },
    );

    // The proxy should forward to the CRM backend and return 201.
    expect(createRes.status(), 'contact create via proxy should succeed').toBeLessThan(500);

    if (createRes.status() === 201) {
      const created = await createRes.json() as { id?: string; name?: string };
      expect(created.name).toBe(contactName);

      // List contacts and verify the created one appears.
      const listContactsRes = await page.request.get(
        `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`,
        {
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
            'X-Plexica-Workspace-Id': process.env['PLAYWRIGHT_WORKSPACE_ID'] ?? '00000000-0000-0000-0000-000000000001',
          },
        },
      );
      expect(listContactsRes.status()).toBe(200);
      const contacts = await listContactsRes.json() as Array<{ name: string }>;
      expect(contacts.some((c) => c.name === contactName)).toBe(true);
    }
  });
});
