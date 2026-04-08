// workspace-members.spec.ts
// E2E-03: Workspace member management (Spec 003, Phase 20.3).
// Tests add member, role change, remove member, access revocation.
// Skips when Keycloak credentials are absent or the stack is not running.

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
  changeMemberRole,
  createWorkspace,
  navigateToWorkspace,
  openWorkspaceMembers,
  removeMember,
} from './helpers/workspace.js';

test.describe('E2E-03: Workspace member management', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('admin adds an existing user as member', async ({ page }) => {
    const wsName = uniqueName('members-add');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    await openWorkspaceMembers(page);

    await addWorkspaceMember(page, MEMBER_USERNAME, 'member');

    await expect(page.getByText(MEMBER_USERNAME)).toBeVisible();
  });

  test('admin changes member role from member to admin', async ({ page }) => {
    const wsName = uniqueName('members-role');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    await openWorkspaceMembers(page);

    await addWorkspaceMember(page, MEMBER_USERNAME, 'member');
    await changeMemberRole(page, MEMBER_USERNAME, 'admin');

    // Verify new role is reflected
    const row = page.getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') });
    await expect(row.getByText('admin')).toBeVisible();
  });

  test('admin removes a member', async ({ page }) => {
    const wsName = uniqueName('members-remove');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    await openWorkspaceMembers(page);

    await addWorkspaceMember(page, MEMBER_USERNAME, 'member');
    await removeMember(page, MEMBER_USERNAME);

    await expect(page.getByText(MEMBER_USERNAME)).not.toBeVisible();
  });

  test('removed member loses access to workspace', async ({ page, context }) => {
    const wsName = uniqueName('members-access');
    await createWorkspace(page, { name: wsName });

    // Get the workspace URL so we can test access later
    await navigateToWorkspace(page, wsName);
    const wsUrl = page.url();

    await openWorkspaceMembers(page);
    await addWorkspaceMember(page, MEMBER_USERNAME, 'member');
    await removeMember(page, MEMBER_USERNAME);

    // Open a new context as the member user
    const memberPage = await context.newPage();
    await loginAsMember(memberPage);
    await memberPage.goto(wsUrl);

    // Should be denied — 403 or redirect away from the workspace
    await expect(
      memberPage
        .getByText(/forbidden|not found|access denied|403/i)
        .or(memberPage.getByRole('heading', { name: /workspaces/i }))
    ).toBeVisible({ timeout: 8_000 });

    await memberPage.close();
  });

  test('members page is keyboard-navigable', async ({ page }) => {
    const wsName = uniqueName('members-a11y');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    await openWorkspaceMembers(page);

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });
});
