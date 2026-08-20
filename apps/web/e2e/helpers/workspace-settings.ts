// workspace-settings.ts
// Page object helpers for workspace settings, delete, and restore operations.
// Extracted from workspace.ts to keep files under 200 lines.

import { expectResponseTo } from './api-response.js';
import { openWorkspaceSettings } from './workspace.js';

import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Workspace settings helpers
// ---------------------------------------------------------------------------

/**
 * Updates the workspace name via the settings form.
 * Navigates to settings, updates name, saves, and asserts the PATCH round-trip
 * through the shared convention (exact pathname + 200) instead of the previous
 * `if (status >= 400) throw`, which also accepted 204/304 and reported failures
 * as raw stack traces.
 */
export async function updateWorkspaceName(page: Page, newName: string): Promise<void> {
  await openWorkspaceSettings(page);
  const workspaceId = workspaceIdFromUrl(page);
  const nameInput = page.getByLabel(/^name$/i);
  await nameInput.clear();
  await nameInput.fill(newName);
  await expectResponseTo(page, `/api/v1/workspaces/${workspaceId}`, 'PATCH', async () => {
    await page.getByRole('button', { name: /save/i }).click();
  });
}

/** Extracts the workspace UUID from the current settings URL. */
function workspaceIdFromUrl(page: Page): string {
  const match = /\/workspaces\/([a-zA-Z0-9-]+)/.exec(page.url());
  if (match?.[1] === undefined) throw new Error(`Not on a workspace page: ${page.url()}`);
  return match[1];
}

// ---------------------------------------------------------------------------
// Workspace delete / restore helpers
// ---------------------------------------------------------------------------

/**
 * Soft-deletes the currently open workspace via the settings page.
 * The settings page shows a "Delete" button; clicking it opens a ConfirmDialog.
 */
export async function deleteWorkspace(page: Page): Promise<void> {
  await openWorkspaceSettings(page);
  // The delete button text is "Delete" (common.delete)
  await page.getByRole('button', { name: /^delete$/i }).click();
  // Confirm in the ConfirmDialog — confirm label is also "Delete"
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: /^delete$/i }).click();
  // Wait for the dialog to close (= delete succeeded)
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
}

/**
 * Restores a soft-deleted workspace via its settings page.
 * Navigates directly to the workspace by ID, then opens settings and restores.
 * Falls back to searching the archived list by name if ID is not provided.
 */
export async function restoreWorkspace(
  page: Page,
  workspaceNameOrId: string,
  opts?: { byId?: boolean }
): Promise<void> {
  if (opts?.byId) {
    // Navigate directly to the archived workspace by ID
    await page.goto(`/workspaces/${workspaceNameOrId}`);
    await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+/);
  } else {
    await page.goto('/workspaces');
    // Click the "Archived" filter button to show archived workspaces
    await page.getByRole('button', { name: /^archived$/i }).click();
    // Wait for the API response after filter change
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/workspaces') &&
        r.url().includes('status=archived') &&
        !r.url().includes('/templates') &&
        !r.url().includes('/members') &&
        r.status() === 200
    );
    // Paginate through archived list to find the workspace
    for (let attempt = 0; attempt < 10; attempt++) {
      const link = page.getByRole('link', { name: workspaceNameOrId });
      if (await link.isVisible().catch(() => false)) break;
      const nextBtn = page.getByRole('button', { name: /next page/i });
      if ((await nextBtn.count()) === 0) break;
      if (await nextBtn.isDisabled()) break;
      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/workspaces') &&
            !r.url().includes('/templates') &&
            !r.url().includes('/members') &&
            r.status() === 200
        ),
        nextBtn.click(),
      ]);
      await page.waitForTimeout(300);
    }
    // Click into the workspace detail page
    await page
      .getByRole('link', { name: workspaceNameOrId })
      .waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('link', { name: workspaceNameOrId }).click();
    await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+/);
  }
  // Navigate to settings
  await openWorkspaceSettings(page);
  // Click the "Restore" button (shown for archived workspaces)
  await page.getByRole('button', { name: /^restore$/i }).click();
  // Confirm in the ConfirmDialog
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: /^restore$/i }).click();
  // Wait for the dialog to close (= restore succeeded)
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
}
