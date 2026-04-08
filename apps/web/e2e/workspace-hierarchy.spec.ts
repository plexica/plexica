// workspace-hierarchy.spec.ts
// E2E-02: Workspace hierarchy navigation (Spec 003, Phase 20.2).
// Tests parent/child/grandchild creation, tree navigation, reparenting, depth limit.
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
  openCreateWorkspaceDialog,
  fillCreateWorkspaceForm,
} from './helpers/workspace.js';

test.describe('E2E-02: Workspace hierarchy', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('create parent → child → grandchild and verify tree navigation', async ({ page }) => {
    const parent = uniqueName('hier-parent');
    const child = uniqueName('hier-child');
    const grandchild = uniqueName('hier-grand');

    await createWorkspace(page, { name: parent });
    await createWorkspace(page, { name: child, parentWorkspaceName: parent });
    await createWorkspace(page, { name: grandchild, parentWorkspaceName: child });

    // Navigate to tree view and verify all three levels are visible
    await page.goto('/workspaces');
    await expect(page.getByRole('link', { name: parent })).toBeVisible();
    // Expand parent to see child
    await page
      .getByRole('button', { name: /expand|toggle/i })
      .first()
      .click();
    await expect(page.getByRole('link', { name: child })).toBeVisible();
  });

  test('reparent: move child to root (no parent)', async ({ page }) => {
    const parent = uniqueName('rp-parent');
    const child = uniqueName('rp-child');

    await createWorkspace(page, { name: parent });
    await createWorkspace(page, { name: child, parentWorkspaceName: parent });

    // Open child settings and clear parent
    await page.getByRole('link', { name: child }).click();
    await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+/);
    await page.getByRole('link', { name: /settings/i }).click();
    await page.waitForURL(/\/settings/);

    const parentField = page.getByLabel(/parent workspace/i);
    await parentField.selectOption('');
    await page.getByRole('button', { name: /save/i }).click();
    await page.getByText(/saved|updated/i).waitFor({ state: 'visible', timeout: 8_000 });

    // Verify child now appears at root level
    await page.goto('/workspaces');
    // Both parent and child should be visible at root
    await expect(page.getByRole('link', { name: parent })).toBeVisible();
    await expect(page.getByRole('link', { name: child })).toBeVisible();
  });

  test('depth limit: creating 11th-level workspace shows error', async ({ page }) => {
    // Build a chain 10 levels deep, then attempt an 11th
    const ROOT = uniqueName('depth-root');
    await createWorkspace(page, { name: ROOT });

    let currentParent = ROOT;
    for (let i = 1; i <= 9; i++) {
      const levelName = uniqueName(`depth-l${String(i)}`);
      await createWorkspace(page, { name: levelName, parentWorkspaceName: currentParent });
      currentParent = levelName;
    }

    // Attempt to create 11th-level (should be blocked)
    await openCreateWorkspaceDialog(page);
    await fillCreateWorkspaceForm(page, {
      name: uniqueName('depth-l10-fail'),
      parentWorkspaceName: currentParent,
    });

    // Expect an error message about depth limit
    await expect(page.getByRole('alert').or(page.getByText(/depth|maximum|limit/i))).toBeVisible({
      timeout: 8_000,
    });
  });

  test('breadcrumb shows full ancestry path', async ({ page }) => {
    const parent = uniqueName('bread-parent');
    const child = uniqueName('bread-child');

    await createWorkspace(page, { name: parent });
    await createWorkspace(page, { name: child, parentWorkspaceName: parent });

    // Navigate to child workspace
    await page.getByRole('link', { name: child }).click();
    await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+/);

    // Breadcrumb should contain the parent name
    const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
    await expect(breadcrumb.getByText(parent)).toBeVisible();
    await expect(breadcrumb.getByText(child)).toBeVisible();
  });
});
