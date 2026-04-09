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
  ADMIN_TENANT_SLUG,
} from './helpers/admin-login.js';
import { API_BASE } from './helpers/api-check.js';
import {
  createWorkspace,
  findWorkspaceInList,
  navigateToWorkspaceById,
  openWorkspaceSettings,
} from './helpers/workspace.js';
import {
  deleteWorkspace,
  restoreWorkspace,
  updateWorkspaceName,
} from './helpers/workspace-settings.js';

/**
 * Creates a workspace via API, bypassing the UI.
 * Useful when the parent workspace dropdown has pagination limits (100 items)
 * and the newly created parent might not appear in the dropdown.
 */
async function createWorkspaceViaApi(
  page: import('@playwright/test').Page,
  payload: { name: string; parentId?: string }
): Promise<string> {
  const accessToken = await page.evaluate(() => {
    const stored = sessionStorage.getItem('plexica-auth');
    if (!stored) return '';
    const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
    return parsed.state?.accessToken ?? '';
  });
  const res = await page.request.post(`${API_BASE}/api/v1/workspaces`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Tenant-Slug': ADMIN_TENANT_SLUG,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(payload),
  });
  if (res.status() >= 400) {
    const body = await res.text().catch(() => 'no body');
    throw new Error(`API workspace creation failed: ${res.status()} — ${body}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

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
    await findWorkspaceInList(page, name);
  });

  test('open workspace detail page', async ({ page }) => {
    const name = uniqueName('ws-detail');
    const id = await createWorkspace(page, { name });

    await navigateToWorkspaceById(page, id);
    await expect(page).toHaveURL(/\/workspaces\/[a-zA-Z0-9-]+/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });

  test('update workspace name via settings', async ({ page }) => {
    const original = uniqueName('ws-update-orig');
    const renamed = uniqueName('ws-update-new');

    const id = await createWorkspace(page, { name: original });
    await navigateToWorkspaceById(page, id);
    await updateWorkspaceName(page, renamed);

    await findWorkspaceInList(page, renamed);
  });

  test('soft-delete workspace — no longer visible in list', async ({ page }) => {
    const name = uniqueName('ws-delete');
    const id = await createWorkspace(page, { name });
    await navigateToWorkspaceById(page, id);
    await deleteWorkspace(page);

    // After delete, the workspace should not appear in the active list
    await page.goto('/workspaces');
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/workspaces') &&
        !r.url().includes('/templates') &&
        !r.url().includes('/members') &&
        r.status() === 200
    );
    await expect(page.getByRole('link', { name })).not.toBeVisible();
  });

  test('soft-delete workspace — children also archived', async ({ page }) => {
    const parent = uniqueName('ws-parent');
    const child = uniqueName('ws-child');

    const parentId = await createWorkspace(page, { name: parent });
    // Create child via API to bypass parent-select dropdown pagination limit.
    // The dropdown only shows the first 100 workspaces; with 150+ accumulated
    // test workspaces the newly created parent may not appear.
    await createWorkspaceViaApi(page, { name: child, parentId });

    await navigateToWorkspaceById(page, parentId);
    await deleteWorkspace(page);

    // After parent delete, child should not appear in the active list
    await page.goto('/workspaces');
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/workspaces') &&
        !r.url().includes('/templates') &&
        !r.url().includes('/members') &&
        r.status() === 200
    );
    await expect(page.getByRole('link', { name: child })).not.toBeVisible();
  });

  test('restore workspace within 30 days — appears in list again', async ({ page }) => {
    const name = uniqueName('ws-restore');
    const id = await createWorkspace(page, { name });
    await navigateToWorkspaceById(page, id);
    await deleteWorkspace(page);

    // Restore by ID — avoids paginated archived-list search
    await restoreWorkspace(page, id, { byId: true });

    await findWorkspaceInList(page, name);
  });

  test('workspace settings page is keyboard-navigable', async ({ page }) => {
    const name = uniqueName('ws-a11y');
    const id = await createWorkspace(page, { name });
    await navigateToWorkspaceById(page, id);
    await openWorkspaceSettings(page);

    // Wait for the form to be fully loaded (the Name input must be visible)
    const nameInput = page.getByLabel(/^name$/i);
    await nameInput.waitFor({ state: 'visible', timeout: 10_000 });
    // Click the body to give the browser focus context, then Tab
    await page.locator('body').click();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });
});
