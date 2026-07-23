// ac-04-crm-workflow.spec.ts — Spec 004, AC-04: CRM Example End-to-End.
// Full browser workflow through the CRM Module Federation remote and proxy.

import { expect, test } from '../helpers/base-fixture.js';
import { loginAsAdmin, requireKeycloakInCI, uniqueName } from '../helpers/admin-login.js';
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

  test('workspace member adds a persisted contact in the CRM remote', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
    const token = await getBrowserToken(page);
    const installId = await ensureCrmInstalled(page, token);
    const workspaceId = await createWorkspaceFixture(page, token, uniqueName('crm-workflow'));

    const contactName = `E2E Contact ${Date.now()}`;
    const email = `e2e-${Date.now()}@example.com`;
    await page.goto(`/workspaces/${workspaceId}`);
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Add Contact' }).click();
    const form = page.getByRole('form', { name: 'Add Contact' });
    await form.getByLabel('Name').fill(contactName);
    await form.getByLabel('Email').fill(email);
    await form.getByLabel('Phone').fill('+1 555 0199');
    await form.getByRole('button', { name: 'Add Contact' }).click();
    await expect(page.getByRole('cell', { name: contactName, exact: true })).toBeVisible();

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
    const contacts = (await listContactsRes.json()) as Array<{ name: string }>;
    expect(contacts.some((contact) => contact.name === contactName)).toBe(true);
  });

  test('workspace.created creates the default CRM pipeline within 2 seconds', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
    const token = await getBrowserToken(page);
    const installId = await ensureCrmInstalled(page, token);
    const workspaceId = await createWorkspaceFixture(page, token, uniqueName('crm-pipeline'));
    const headers = { Authorization: `Bearer ${token}`, 'X-Plexica-Workspace-Id': workspaceId };

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `${API_BASE}/api/v1/plugins/${installId}/proxy/deals`,
            { headers }
          );
          if (!response.ok()) return [];
          const deals = (await response.json()) as Array<{ title: string }>;
          return deals.filter((deal) => deal.title === 'Default Pipeline').length;
        },
        { timeout: 2_000, intervals: [100, 200, 300] }
      )
      .toBe(1);
  });
});
