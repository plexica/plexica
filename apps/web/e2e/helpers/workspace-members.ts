// workspace-members.ts
// Page object helpers for workspace member management (E2E).
// The UI uses an "Invite by email" dialog (not direct add). For tests that need
// an actual member immediately, use `addMemberViaApi()` which calls the backend
// API directly.

import { API_BASE } from './api-check.js';
import { ADMIN_TENANT_SLUG } from './admin-login.js';

import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// API-based member management (bypasses UI for test setup)
// ---------------------------------------------------------------------------

/**
 * Retrieves the access token from the page's session storage.
 * The Zustand auth store persists the token under `plexica-auth`.
 */
async function getAccessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    const stored = sessionStorage.getItem('plexica-auth');
    if (!stored) return '';
    const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
    return parsed.state?.accessToken ?? '';
  });
}

/**
 * Adds a member to a workspace via the backend API.
 * Requires the member user to have logged in at least once (JIT provisioning
 * creates the user_profile row). If the user has no profile, this will fail.
 *
 * For tests, we use the invitation flow via UI instead.
 */
export async function addMemberViaApi(
  page: Page,
  workspaceId: string,
  userId: string,
  role: 'admin' | 'member' | 'viewer' = 'member'
): Promise<void> {
  const token = await getAccessToken(page);
  const res = await page.request.post(`${API_BASE}/api/v1/workspaces/${workspaceId}/members`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Slug': ADMIN_TENANT_SLUG,
      'Content-Type': 'application/json',
    },
    data: { userId, role },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => 'no body');
    throw new Error(`addMemberViaApi failed: ${res.status()} — ${body}`);
  }
}

// ---------------------------------------------------------------------------
// UI-based invite flow
// ---------------------------------------------------------------------------

/**
 * Opens the invite dialog and sends an invitation to the given email.
 * Assumes we are on the workspace members page.
 * The invitation creates a PENDING entry — the user is NOT a member yet
 * until they accept the invitation.
 */
export async function sendInviteViaUi(
  page: Page,
  email: string,
  role: 'admin' | 'member' | 'viewer' = 'member'
): Promise<void> {
  // The button text is "Invite by email" (i18n key: members.invite)
  await page.getByRole('button', { name: /invite/i }).click();
  // Dialog opens with email input and role select.
  // Use getByRole('textbox') to avoid ambiguity with the dialog title label.
  await page.getByRole('dialog').getByRole('textbox', { name: /email/i }).fill(email);
  // Role select is a Radix UI Select — use the combobox role
  if (role !== 'member') {
    // Default is 'member', only change if different
    const roleSelect = page.getByRole('combobox', { name: /member/i });
    await roleSelect.click();
    const listbox = page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    const option = listbox.locator('[role="option"]', {
      hasText: new RegExp(`^${role}$`, 'i'),
    });
    await option.click();
  }
  // Submit — button text is "Invite by email"
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /invite/i })
    .click();
  // Wait for dialog to close (success)
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Member row interactions (after member exists in the list)
// ---------------------------------------------------------------------------

/**
 * Finds the member row (an <li> element) by email text.
 * The members page renders members as `<li>` inside `<ul>`.
 */
function findMemberRow(page: Page, email: string) {
  return page.locator('li').filter({ hasText: email });
}

/**
 * Changes a member's role using the inline Radix Select.
 * Assumes we are on the workspace members page and the member is visible.
 */
export async function changeMemberRole(
  page: Page,
  email: string,
  newRole: 'admin' | 'member' | 'viewer'
): Promise<void> {
  const row = findMemberRow(page, email);
  // The Radix Select trigger inside the row — it has role="combobox"
  const roleTrigger = row.getByRole('combobox');
  await roleTrigger.click();
  const listbox = page.locator('[role="listbox"]');
  await listbox.waitFor({ state: 'visible', timeout: 5_000 });
  const option = listbox.locator('[role="option"]', {
    hasText: new RegExp(`^${newRole}$`, 'i'),
  });
  await option.click();
  // Wait for the API call to complete
  await page.waitForTimeout(1_000);
}

/**
 * Removes a member from the workspace using the Delete button.
 * The button text is "Delete" (i18n: common.delete) with aria-label "Remove member".
 * There is no confirm dialog — the action is immediate.
 */
export async function removeMember(page: Page, email: string): Promise<void> {
  const row = findMemberRow(page, email);
  // The button has aria-label "Remove member" (members.remove.confirm.title)
  await row.getByRole('button', { name: /remove member|delete/i }).click();
  // Wait for the row to disappear after deletion
  await row.waitFor({ state: 'hidden', timeout: 8_000 });
}

// Legacy export for backwards compatibility
export { sendInviteViaUi as addWorkspaceMember };
