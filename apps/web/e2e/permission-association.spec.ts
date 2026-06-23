// permission-association.spec.ts
// E2E-12: Permission association (Spec 003, Phase 20.12).
// Tests /roles/:roleId/permissions page which shows workspace members with inline role selector.
// Note: This page uses roleId as a workspaceId — it shows members of a "workspace"
// identified by the roleId param. The functional permission management happens
// on the workspace members page (/workspaces/:id/members).
// Skips when Keycloak credentials are absent or the stack is not running.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import {
  createWorkspace,
  navigateToWorkspaceById,
  openWorkspaceMembers,
} from './helpers/workspace.js';
import { sendInviteViaUi } from './helpers/workspace-members.js';
import { MEMBER_USERNAME } from './helpers/admin-login.js';

test.describe('E2E-12: Permission association', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('workspace members page shows invited users with role', async ({ page }) => {
    const wsName = uniqueName('perm-list-ws');
    const id = await createWorkspace(page, { name: wsName });
    await navigateToWorkspaceById(page, id);
    await openWorkspaceMembers(page);

    // Send an invite
    await sendInviteViaUi(page, MEMBER_USERNAME, 'member');

    // After invite, the "Invitation pending" section heading should appear.
    // The email is masked by the backend (e.g., "m***@e2e.local"), so we
    // verify the pending section exists rather than matching the exact email.
    await expect(page.getByRole('heading', { name: /invitation pending/i })).toBeVisible({
      timeout: 8_000,
    });
  });

  test('/roles/:roleId/permissions page renders', async ({ page }) => {
    const wsName = uniqueName('perm-page-ws');
    const id = await createWorkspace(page, { name: wsName });

    // Navigate to the permission-association page using the workspace ID as roleId
    await page.goto(`/roles/${id}/permissions`);
    await expect(page).toHaveURL(/\/roles\/.*\/permissions/);

    // Page heading should be visible (uses "Members" i18n key)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/roles/:roleId/permissions passes axe-core accessibility check', async ({ page }) => {
    const wsName = uniqueName('perm-axe-ws');
    const id = await createWorkspace(page, { name: wsName });

    await page.goto(`/roles/${id}/permissions`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
