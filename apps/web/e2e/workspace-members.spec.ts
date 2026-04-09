// workspace-members.spec.ts
// E2E-03: Workspace member management (Spec 003, Phase 20.3).
// Tests invite flow, pending invitation display, and page structure.
// Note: Workspace creation does NOT auto-add the creator as a member, so the
// members list starts empty. These tests focus on the invite UI and page structure.
// Skips when Keycloak credentials are absent or the stack is not running.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  MEMBER_USERNAME,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import {
  createWorkspace,
  navigateToWorkspaceById,
  openWorkspaceMembers,
} from './helpers/workspace.js';
import { sendInviteViaUi } from './helpers/workspace-members.js';

test.describe('E2E-03: Workspace member management', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('members page shows heading and invite button', async ({ page }) => {
    const wsName = uniqueName('members-page');
    const id = await createWorkspace(page, { name: wsName });
    await navigateToWorkspaceById(page, id);
    await openWorkspaceMembers(page);

    await expect(page.getByRole('heading', { name: /members/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /invite/i })).toBeVisible();
  });

  test('admin sends an invitation via the invite dialog', async ({ page }) => {
    const wsName = uniqueName('members-invite');
    const id = await createWorkspace(page, { name: wsName });
    await navigateToWorkspaceById(page, id);
    await openWorkspaceMembers(page);

    await sendInviteViaUi(page, MEMBER_USERNAME, 'member');

    // The invitation should appear in the pending invitations section.
    // The email is masked by the backend (e.g. "m***@e2e.local").
    // Use the heading to avoid strict mode violation (both heading and badge say "Invitation pending").
    await expect(page.getByRole('heading', { name: /invitation pending/i })).toBeVisible({
      timeout: 8_000,
    });
  });

  test('invite dialog opens and has required fields', async ({ page }) => {
    const wsName = uniqueName('members-dialog');
    const id = await createWorkspace(page, { name: wsName });
    await navigateToWorkspaceById(page, id);
    await openWorkspaceMembers(page);

    await page.getByRole('button', { name: /invite/i }).click();

    // Dialog should be visible with email input
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: /email/i })).toBeVisible();
    // Role selector (Radix combobox)
    await expect(dialog.getByRole('combobox')).toBeVisible();
    // Submit and cancel buttons (scope to form to avoid X close button)
    await expect(dialog.getByRole('button', { name: /invite/i })).toBeVisible();
    await expect(dialog.locator('form').getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('members page is keyboard-navigable', async ({ page }) => {
    const wsName = uniqueName('members-a11y');
    const id = await createWorkspace(page, { name: wsName });
    await navigateToWorkspaceById(page, id);
    await openWorkspaceMembers(page);

    // Wait for the page heading to load
    await expect(page.getByRole('heading', { name: /members/i })).toBeVisible();

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });
});
