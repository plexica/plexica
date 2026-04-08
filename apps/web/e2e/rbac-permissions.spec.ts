// rbac-permissions.spec.ts
// E2E-06: Role-based access control UI enforcement (Spec 003, Phase 20.6).
// Tests viewer, member, and workspace-admin role restrictions in the UI.
// Skips when Keycloak credentials are absent or the stack is not running.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  loginAsMember,
  loginAsViewer,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import { API_BASE } from './helpers/api-check.js';
import {
  addWorkspaceMember,
  createWorkspace,
  navigateToWorkspace,
  openWorkspaceMembers,
} from './helpers/workspace.js';
import { ADMIN_TENANT_SLUG, MEMBER_USERNAME } from './helpers/admin-login.js';

test.describe('E2E-06: RBAC — viewer restrictions', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('viewer: create workspace button is hidden or disabled', async ({ page }) => {
    await loginAsViewer(page);
    await page.goto('/workspaces');

    const createBtn = page.getByRole('button', { name: /new workspace/i });
    // Button must either not exist or be disabled
    const count = await createBtn.count();
    if (count > 0) {
      await expect(createBtn).toBeDisabled();
    } else {
      expect(count).toBe(0);
    }
  });

  test('viewer: create workspace API returns 403', async ({ page }) => {
    await loginAsViewer(page);

    const accessToken = await page.evaluate(() => {
      const stored = sessionStorage.getItem('plexica-auth');
      if (!stored) return '';
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      return parsed.state?.accessToken ?? '';
    });

    const res = await page.request.post(`${API_BASE}/api/workspaces`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Slug': ADMIN_TENANT_SLUG,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({ name: uniqueName('viewer-attempt') }),
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('E2E-06: RBAC — member restrictions', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('member: manage users nav item is hidden', async ({ page }) => {
    await loginAsMember(page);
    await expect(
      page.getByRole('link', { name: /manage users|user management/i })
    ).not.toBeVisible();
  });

  test('member: workspace management UI (settings tab) is not accessible', async ({
    page,
    context,
  }) => {
    // First create workspace as admin and add member
    const adminPage = await context.newPage();
    await loginAsAdmin(adminPage);
    const wsName = uniqueName('rbac-member-ws');
    await createWorkspace(adminPage, { name: wsName });
    await navigateToWorkspace(adminPage, wsName);
    await openWorkspaceMembers(adminPage);
    await addWorkspaceMember(adminPage, MEMBER_USERNAME, 'member');
    const wsUrl = adminPage.url().replace(/\/members$/, '');
    await adminPage.close();

    // Member tries to access settings
    await loginAsMember(page);
    await page.goto(`${wsUrl}/settings`);
    await expect(
      page
        .getByText(/forbidden|403|not allowed|access denied/i)
        .or(page.getByText(/you don't have permission/i))
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('E2E-06: RBAC — workspace admin restrictions', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('workspace admin can manage their own workspace but not others', async ({
    page,
    context,
  }) => {
    // Create two workspaces as tenant admin
    const adminPage = await context.newPage();
    await loginAsAdmin(adminPage);

    const myWs = uniqueName('rbac-ws-admin-own');
    const otherWs = uniqueName('rbac-ws-admin-other');
    await createWorkspace(adminPage, { name: myWs });
    await createWorkspace(adminPage, { name: otherWs });

    // Promote member to workspace-admin on myWs only
    await navigateToWorkspace(adminPage, myWs);
    await openWorkspaceMembers(adminPage);
    await addWorkspaceMember(adminPage, MEMBER_USERNAME, 'admin');
    const myWsUrl = adminPage.url().replace(/\/members$/, '');

    await navigateToWorkspace(adminPage, otherWs);
    const otherWsUrl = adminPage.url();
    await adminPage.close();

    // Log in as member (now workspace admin on myWs)
    await loginAsMember(page);

    // Can access settings on their own workspace
    await page.goto(`${myWsUrl}/settings`);
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 8_000 });

    // Cannot access settings on the other workspace
    await page.goto(`${otherWsUrl}/settings`);
    await expect(page.getByText(/forbidden|403|not allowed|access denied/i)).toBeVisible({
      timeout: 8_000,
    });
  });
});
