// workspace.ts
// Page object helpers for workspace operations (E2E-01 through E2E-12).
// All locators use accessible roles/labels per the project convention.

import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Workspace form helpers
// ---------------------------------------------------------------------------

/**
 * Fills and submits the "Create Workspace" form.
 * Assumes the dialog/form is already open.
 */
export async function fillCreateWorkspaceForm(
  page: Page,
  opts: { name: string; parentWorkspaceName?: string }
): Promise<void> {
  await page.getByLabel(/workspace name/i).fill(opts.name);
  if (opts.parentWorkspaceName !== undefined) {
    const parentSelect = page.getByLabel(/parent workspace/i);
    await parentSelect.click();
    await page.getByRole('option', { name: opts.parentWorkspaceName }).click();
  }
  await page.getByRole('button', { name: /create/i }).click();
}

/**
 * Opens the "New Workspace" dialog from the workspace list page.
 */
export async function openCreateWorkspaceDialog(page: Page): Promise<void> {
  await page.goto('/workspaces');
  await page.getByRole('button', { name: /new workspace/i }).click();
}

/**
 * Creates a workspace end-to-end: navigate, open dialog, fill, submit.
 * Returns when the workspace appears in the list.
 */
export async function createWorkspace(
  page: Page,
  opts: { name: string; parentWorkspaceName?: string }
): Promise<void> {
  await openCreateWorkspaceDialog(page);
  await fillCreateWorkspaceForm(page, opts);
  await page.getByRole('link', { name: opts.name }).waitFor({ state: 'visible', timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Workspace navigation helpers
// ---------------------------------------------------------------------------

/**
 * Navigates to a workspace detail page by clicking the workspace name in the list.
 * Waits for the URL to change to /workspaces/:id.
 */
export async function navigateToWorkspace(page: Page, workspaceName: string): Promise<void> {
  await page.goto('/workspaces');
  await page.getByRole('link', { name: workspaceName }).click();
  await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+/);
}

/**
 * Navigates to the workspace settings tab.
 * Assumes we are already on the workspace detail page.
 */
export async function openWorkspaceSettings(page: Page): Promise<void> {
  await page.getByRole('link', { name: /settings/i }).click();
  await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+\/settings/);
}

/**
 * Navigates to the workspace members tab.
 * Assumes we are already on the workspace detail page.
 */
export async function openWorkspaceMembers(page: Page): Promise<void> {
  await page.getByRole('link', { name: /members/i }).click();
  await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+\/members/);
}

// ---------------------------------------------------------------------------
// Workspace settings helpers
// ---------------------------------------------------------------------------

/**
 * Updates the workspace name via the settings form.
 * Navigates to settings, updates name, saves.
 */
export async function updateWorkspaceName(page: Page, newName: string): Promise<void> {
  await openWorkspaceSettings(page);
  const nameInput = page.getByLabel(/workspace name/i);
  await nameInput.clear();
  await nameInput.fill(newName);
  await page.getByRole('button', { name: /save/i }).click();
  await page.getByText(/saved|updated/i).waitFor({ state: 'visible', timeout: 8_000 });
}

// ---------------------------------------------------------------------------
// Workspace delete / restore helpers
// ---------------------------------------------------------------------------

/**
 * Soft-deletes the currently open workspace via the settings page.
 */
export async function deleteWorkspace(page: Page): Promise<void> {
  await openWorkspaceSettings(page);
  await page.getByRole('button', { name: /delete workspace/i }).click();
  // Confirmation dialog
  await page.getByRole('button', { name: /confirm|yes, delete/i }).click();
  await page.waitForURL(/\/workspaces/, { timeout: 10_000 });
}

/**
 * Restores a soft-deleted workspace from the trash/archive section.
 */
export async function restoreWorkspace(page: Page, workspaceName: string): Promise<void> {
  await page.goto('/workspaces?show=archived');
  const row = page.getByRole('row', { name: new RegExp(workspaceName, 'i') });
  await row.getByRole('button', { name: /restore/i }).click();
  await page.getByText(/restored/i).waitFor({ state: 'visible', timeout: 8_000 });
}

// ---------------------------------------------------------------------------
// Member management helpers
// ---------------------------------------------------------------------------

/**
 * Adds a member to the workspace by searching for their email.
 * Assumes we are on the workspace members page.
 */
export async function addWorkspaceMember(
  page: Page,
  email: string,
  role: 'admin' | 'member' | 'viewer' = 'member'
): Promise<void> {
  await page.getByRole('button', { name: /add member/i }).click();
  await page.getByLabel(/search.*email|email/i).fill(email);
  await page.getByRole('option', { name: email }).click();
  await page.getByLabel(/role/i).selectOption(role);
  await page.getByRole('button', { name: /add|invite/i }).click();
  await page.getByText(email).waitFor({ state: 'visible', timeout: 8_000 });
}

/**
 * Changes a member's role inline on the members page.
 */
export async function changeMemberRole(
  page: Page,
  email: string,
  newRole: 'admin' | 'member' | 'viewer'
): Promise<void> {
  const row = page.getByRole('row', { name: new RegExp(email, 'i') });
  await row.getByRole('combobox', { name: /role/i }).selectOption(newRole);
  await row.getByRole('button', { name: /save|update/i }).click();
}

/**
 * Removes a member from the workspace.
 */
export async function removeMember(page: Page, email: string): Promise<void> {
  const row = page.getByRole('row', { name: new RegExp(email, 'i') });
  await row.getByRole('button', { name: /remove/i }).click();
  await page.getByRole('button', { name: /confirm|yes/i }).click();
  await row.waitFor({ state: 'hidden', timeout: 8_000 });
}
