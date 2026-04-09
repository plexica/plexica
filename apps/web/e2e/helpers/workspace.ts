// workspace.ts
// Page object helpers for workspace operations (E2E-01 through E2E-12).
// All locators use accessible roles/labels per the project convention.

import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Workspace form helpers
// ---------------------------------------------------------------------------

/**
 * Fills the "Create Workspace" form fields.
 * Assumes the dialog/form is already open.
 * Does NOT click the submit button — the caller does that.
 */
export async function fillCreateWorkspaceForm(
  page: Page,
  opts: { name: string; parentWorkspaceName?: string }
): Promise<void> {
  await page.getByLabel(/^name$/i).fill(opts.name);
  if (opts.parentWorkspaceName !== undefined) {
    // The Parent Workspace select only renders after useWorkspaces() resolves.
    // Wait for it to appear before interacting.
    const parentTrigger = page.getByLabel(/parent workspace/i);
    await parentTrigger.waitFor({ state: 'visible', timeout: 15_000 });
    // Radix Select renders options in a Portal to <body>.
    // Click the trigger, wait for the listbox to appear, then find the item by text.
    await parentTrigger.click();
    // Wait for the Radix Select listbox to appear
    const listbox = page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    // The dropdown may contain many items from previous test runs.
    // Scroll the target option into view before clicking.
    const option = listbox.locator('[role="option"]', {
      hasText: opts.parentWorkspaceName,
    });
    await option.scrollIntoViewIfNeeded();
    // Use force:true because Radix Portal positioning may still report
    // the element as outside the browser viewport even after scrolling
    // within the dropdown's own scroll container.
    await option.click({ force: true });
  }
}

/**
 * Opens the "New Workspace" dialog from the workspace list page.
 */
export async function openCreateWorkspaceDialog(page: Page): Promise<void> {
  await page.goto('/workspaces');
  await page.getByRole('button', { name: /new workspace|create workspace/i }).click();
}

/**
 * Creates a workspace end-to-end: navigate, open dialog, fill, submit.
 * Intercepts the POST response to confirm creation succeeded.
 * Returns the created workspace ID (from the response body).
 */
export async function createWorkspace(
  page: Page,
  opts: { name: string; parentWorkspaceName?: string }
): Promise<string> {
  await openCreateWorkspaceDialog(page);
  // Fill form fields first (may take time if parent select needs to load)
  await fillCreateWorkspaceForm(page, opts);
  // Start listening for the POST response AFTER filling, right before submit
  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/workspaces') &&
      r.request().method() === 'POST' &&
      !r.url().includes('/members') &&
      !r.url().includes('/templates')
  );
  await page.getByRole('button', { name: /create/i }).click();
  const response = await responsePromise;
  if (response.status() >= 400) {
    const body = await response.text().catch(() => 'no body');
    throw new Error(`Workspace creation failed: ${response.status()} — ${body}`);
  }
  const body = (await response.json()) as { id: string };
  // Dialog closes on success — wait for the dialog content to disappear.
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10_000 });
  return body.id;
}

// ---------------------------------------------------------------------------
// Workspace navigation helpers
// ---------------------------------------------------------------------------

/**
 * Finds a workspace link on the paginated workspace list.
 * Navigates through pages until found (max 10 pages).
 * Waits for the API response after each "Next page" click.
 */
export async function findWorkspaceInList(page: Page, workspaceName: string): Promise<void> {
  await page.goto('/workspaces');
  // Wait for the initial workspace list to load
  await page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/workspaces') &&
      !r.url().includes('/templates') &&
      !r.url().includes('/members') &&
      r.status() === 200
  );

  for (let attempt = 0; attempt < 10; attempt++) {
    const link = page.getByRole('link', { name: workspaceName });
    if (await link.isVisible().catch(() => false)) return;
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
  // Final assertion — will fail with a clear message if not found
  await page
    .getByRole('link', { name: workspaceName })
    .waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Navigates directly to a workspace detail page by ID.
 * Much faster and more reliable than searching through paginated list.
 */
export async function navigateToWorkspaceById(page: Page, workspaceId: string): Promise<void> {
  await page.goto(`/workspaces/${workspaceId}`);
  await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+/);
}

/**
 * Navigates to a workspace detail page by clicking its name in the list.
 * Handles pagination — searches through pages if needed.
 */
export async function navigateToWorkspace(page: Page, workspaceName: string): Promise<void> {
  await findWorkspaceInList(page, workspaceName);
  await page.getByRole('link', { name: workspaceName }).click();
  await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+/);
}

/**
 * Navigates to the workspace settings page.
 * Uses direct URL navigation since workspace detail has no settings tab.
 */
export async function openWorkspaceSettings(page: Page): Promise<void> {
  const currentUrl = page.url();
  const match = currentUrl.match(/\/workspaces\/([a-zA-Z0-9-]+)/);
  if (match === null) throw new Error(`Not on a workspace detail page: ${currentUrl}`);
  await page.goto(`/workspaces/${match[1]}/settings`);
  await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+\/settings/);
}

/**
 * Navigates to the workspace members page.
 * Uses direct URL navigation since workspace detail has no members tab.
 */
export async function openWorkspaceMembers(page: Page): Promise<void> {
  const currentUrl = page.url();
  const match = currentUrl.match(/\/workspaces\/([a-zA-Z0-9-]+)/);
  if (match === null) throw new Error(`Not on a workspace detail page: ${currentUrl}`);
  await page.goto(`/workspaces/${match[1]}/members`);
  await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+\/members/);
}
