// permission-association.spec.ts
// E2E-12: Permission association (Spec 003, Phase 20.12).
// Tests /workspaces/:id/permissions: see members, inline role change, non-admin denied.
// Skips when Keycloak credentials are absent or the stack is not running.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  loginAsMember,
  MEMBER_USERNAME,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import {
  addWorkspaceMember,
  createWorkspace,
  navigateToWorkspace,
  openWorkspaceMembers,
} from './helpers/workspace.js';

test.describe('E2E-12: Permission association', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('workspace admin opens /permissions and sees member list with roles', async ({ page }) => {
    const wsName = uniqueName('perm-list-ws');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    await openWorkspaceMembers(page);
    await addWorkspaceMember(page, MEMBER_USERNAME, 'member');

    // Navigate to permissions page
    await page.goto(page.url().replace(/\/members$/, '/permissions'));
    await expect(page).toHaveURL(/\/permissions/);

    // Member should appear with a role indicator
    await expect(page.getByText(MEMBER_USERNAME)).toBeVisible();
    await expect(
      page
        .getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') })
        .getByText(/member|admin|viewer/i)
    ).toBeVisible();
  });

  test('inline role change persists on page refresh', async ({ page }) => {
    const wsName = uniqueName('perm-change-ws');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    await openWorkspaceMembers(page);
    await addWorkspaceMember(page, MEMBER_USERNAME, 'member');

    const permUrl = page.url().replace(/\/members$/, '/permissions');
    await page.goto(permUrl);
    await expect(page).toHaveURL(/\/permissions/);

    // Change role inline
    const row = page.getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') });
    await row.getByRole('combobox', { name: /role/i }).selectOption('viewer');
    // The change may auto-save or require a save button
    const saveBtn = row.getByRole('button', { name: /save|update/i });
    const hasSaveBtn = await saveBtn.count();
    if (hasSaveBtn > 0) await saveBtn.click();

    // Wait for success feedback
    await page
      .getByText(/saved|updated/i)
      .waitFor({ state: 'visible', timeout: 8_000 })
      .catch(() => {
        // Some implementations save silently without a toast
      });

    // Reload and verify role persisted
    await page.reload();
    const refreshedRow = page.getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') });
    await expect(refreshedRow.getByRole('combobox', { name: /role/i })).toHaveValue('viewer');
  });

  test('non-admin cannot access /workspaces/:id/permissions (redirected or 403)', async ({
    page,
    context,
  }) => {
    // Admin creates workspace and adds member with "member" (not admin) role
    const adminWsName = uniqueName('perm-deny-ws');
    await createWorkspace(page, { name: adminWsName });
    await navigateToWorkspace(page, adminWsName);
    await openWorkspaceMembers(page);
    await addWorkspaceMember(page, MEMBER_USERNAME, 'member');

    const permUrl = page.url().replace(/\/members$/, '/permissions');

    // Log in as the member and try to access permissions page
    const memberPage = await context.newPage();
    await loginAsMember(memberPage);
    await memberPage.goto(permUrl);

    await expect(
      memberPage
        .getByText(/forbidden|403|not allowed|access denied/i)
        .or(memberPage.getByRole('heading', { name: /workspaces|dashboard/i }))
    ).toBeVisible({ timeout: 8_000 });

    await memberPage.close();
  });

  test('/permissions page is keyboard-navigable', async ({ page }) => {
    const wsName = uniqueName('perm-a11y-ws');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    const permUrl = page.url() + '/permissions';
    await page.goto(permUrl);

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });

  test('/workspaces/:id/permissions passes axe-core accessibility check', async ({ page }) => {
    const wsName = uniqueName('perm-axe-ws');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    const permUrl = page.url() + '/permissions';
    await page.goto(permUrl);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
