// workspace-hierarchy.spec.ts
// E2E-02: Workspace hierarchy (Spec 003, Phase 20.2).
// Tests parent-child creation via the create workspace dialog.
import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, uniqueName } from './helpers/admin-login.js';
import { createWorkspace, navigateToWorkspaceById } from './helpers/workspace.js';

test.describe('E2E-02: Workspace hierarchy', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('create parent workspace, then child with parent selected', async ({ page }) => {
    const parentName = uniqueName('hier-parent');
    const childName = uniqueName('hier-child');

    // Create parent
    const parentId = await createWorkspace(page, { name: parentName });

    // Create child with parent selected
    const childId = await createWorkspace(page, {
      name: childName,
      parentWorkspaceName: parentName,
    });

    // Verify parent detail page shows the parent workspace
    await navigateToWorkspaceById(page, parentId);
    await expect(page.getByRole('heading', { name: parentName })).toBeVisible();

    // Verify child detail page shows the child workspace
    await navigateToWorkspaceById(page, childId);
    await expect(page.getByRole('heading', { name: childName })).toBeVisible();
  });

  test('child workspace detail page shows parent reference', async ({ page }) => {
    const parentName = uniqueName('hier-ref-p');
    const childName = uniqueName('hier-ref-c');

    const parentId = await createWorkspace(page, { name: parentName });
    const childId = await createWorkspace(page, {
      name: childName,
      parentWorkspaceName: parentName,
    });

    // Navigate to child and verify its parent reference.
    await navigateToWorkspaceById(page, childId);
    await expect(page.getByRole('heading', { name: childName })).toBeVisible();
    const parentLink = page.getByRole('link', { name: parentName, exact: true });
    await expect(parentLink).toBeVisible();
    await expect(parentLink).toHaveAttribute('href', `/workspaces/${parentId}`);
  });
});
