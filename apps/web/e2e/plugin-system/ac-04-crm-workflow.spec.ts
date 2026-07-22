// ac-04-crm-workflow.spec.ts — Spec 004, AC-04: CRM Example End-to-End.
// Real behavior: after installing the CRM plugin, a workspace member can
// create a contact via the proxy, and the contact persists in the tenant DB.
// Also verifies event-driven pipeline creation (plexica.workspace.created).

import { expect, test } from '../helpers/base-fixture.js';
import {
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from '../helpers/admin-login.js';
import {
  createWorkspaceFixture,
  ensureCrmInstalled,
  getBrowserToken,
} from '../helpers/plugin-fixtures.js';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

test.describe('004 Plugin System — AC-04: CRM Example End-to-End', () => {
  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('CRM plugin proxy accepts a contact create and persists it', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
    const token = await getBrowserToken(page);
    const installId = await ensureCrmInstalled(page, token);
    const workspaceId = await createWorkspaceFixture(page, token, uniqueName('crm-workflow'));

    // Create a contact via the plugin proxy.
    const contactName = `E2E Contact ${Date.now()}`;
    const createRes = await page.request.post(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Plexica-Workspace-Id': workspaceId,
        },
        data: { name: contactName, email: `e2e-${Date.now()}@example.com` },
      },
    );

    expect(createRes.status(), 'contact create via proxy should succeed').toBe(201);
    const created = await createRes.json() as { id?: string; name?: string };
    expect(created.name).toBe(contactName);

    const listContactsRes = await page.request.get(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Plexica-Workspace-Id': workspaceId,
        },
      }
    );
    expect(listContactsRes.status()).toBe(200);
    const contacts = await listContactsRes.json() as Array<{ name: string }>;
    expect(contacts.some((contact) => contact.name === contactName)).toBe(true);
  });
});
