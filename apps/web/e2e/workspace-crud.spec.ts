// workspace-crud.spec.ts
// E2E-01: Full browser → API → DB flow for workspace CRUD (Spec 003, Phase 20.1).
// Tests the complete lifecycle: create → detail → update → soft-delete → restore.
// Skips when Keycloak credentials are absent or the stack is not running.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import {
  createWorkspace,
  deleteWorkspace,
  navigateToWorkspace,
  openWorkspaceSettings,
  restoreWorkspace,
  updateWorkspaceName,
} from './helpers/workspace.js';

test.describe('E2E-01: Workspace CRUD', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('create workspace — appears in workspace list', async ({ page }) => {
    const name = uniqueName('ws-create');
    await createWorkspace(page, { name });

    await page.goto('/workspaces');
    await expect(page.getByRole('link', { name })).toBeVisible();
  });

  test('open workspace detail page', async ({ page }) => {
    const name = uniqueName('ws-detail');
    await createWorkspace(page, { name });

    await navigateToWorkspace(page, name);
    await expect(page).toHaveURL(/\/workspaces\/[a-zA-Z0-9-]+/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });

  test('update workspace name via settings', async ({ page }) => {
    const original = uniqueName('ws-update-orig');
    const renamed = uniqueName('ws-update-new');

    await createWorkspace(page, { name: original });
    await navigateToWorkspace(page, original);
    await updateWorkspaceName(page, renamed);

    await page.goto('/workspaces');
    await expect(page.getByRole('link', { name: renamed })).toBeVisible();
    await expect(page.getByRole('link', { name: original })).not.toBeVisible();
  });

  test('soft-delete workspace — no longer visible in list', async ({ page }) => {
    const name = uniqueName('ws-delete');
    await createWorkspace(page, { name });
    await navigateToWorkspace(page, name);
    await deleteWorkspace(page);

    await page.goto('/workspaces');
    await expect(page.getByRole('link', { name })).not.toBeVisible();
  });

  test('soft-delete workspace — children also archived', async ({ page }) => {
    const parent = uniqueName('ws-parent');
    const child = uniqueName('ws-child');

    await createWorkspace(page, { name: parent });
    await createWorkspace(page, { name: child, parentWorkspaceName: parent });

    await navigateToWorkspace(page, parent);
    await deleteWorkspace(page);

    await page.goto('/workspaces');
    await expect(page.getByRole('link', { name: child })).not.toBeVisible();
  });

  test('restore workspace within 30 days — appears in list again', async ({ page }) => {
    const name = uniqueName('ws-restore');
    await createWorkspace(page, { name });
    await navigateToWorkspace(page, name);
    await deleteWorkspace(page);

    await restoreWorkspace(page, name);

    await page.goto('/workspaces');
    await expect(page.getByRole('link', { name })).toBeVisible();
  });

  test('workspace settings page is keyboard-navigable', async ({ page }) => {
    const name = uniqueName('ws-a11y');
    await createWorkspace(page, { name });
    await navigateToWorkspace(page, name);
    await openWorkspaceSettings(page);

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });
});
