// ac-07-database-isolation.spec.ts — Spec 004, AC-07: Database Isolation.
// Real behavior: CRM migrations create tenant-local tables and contact queries
// scoped to workspace B cannot observe rows belonging to workspace A.

import { coreApiUrl } from '../../../../e2e/playwright-base.js';
import { expect, test } from '../helpers/base-fixture.js';
import { loginAsAdmin, requireKeycloakInCI, uniqueName } from '../helpers/admin-login.js';
import { ensureCrmInstalled } from '../helpers/crm-plugin-fixture.js';
import { createWorkspaceFixture, getBrowserToken } from '../helpers/plugin-fixtures.js';

const API_BASE = coreApiUrl();

test.describe('004 Plugin System — AC-07: Database Isolation', () => {
  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('contacts created in workspace A are NOT visible from workspace B', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
    const token = await getBrowserToken(page);
    const installId = await ensureCrmInstalled(page, token);
    const workspaceA = await createWorkspaceFixture(page, token, uniqueName('crm-iso-a'));
    const workspaceB = await createWorkspaceFixture(page, token, uniqueName('crm-iso-b'));
    const contactName = uniqueName('IsolationA');

    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Plexica-Workspace-Id': workspaceA,
      'Content-Type': 'application/json',
    };
    const created = await page.request.post(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`,
      { headers, data: { name: contactName } }
    );
    expect(created.status(), await created.text()).toBe(201);

    const workspaceBContacts = await page.request.get(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`,
      { headers: { ...headers, 'X-Plexica-Workspace-Id': workspaceB } }
    );
    expect(workspaceBContacts.status()).toBe(200);
    expect((await workspaceBContacts.json()) as Array<{ name: string }>).not.toContainEqual(
      expect.objectContaining({ name: contactName })
    );

    const workspaceAContacts = await page.request.get(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`,
      { headers }
    );
    expect(workspaceAContacts.status()).toBe(200);
    expect((await workspaceAContacts.json()) as Array<{ name: string }>).toContainEqual(
      expect.objectContaining({ name: contactName })
    );
  });
});
