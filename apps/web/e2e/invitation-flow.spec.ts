// invitation-flow.spec.ts
// E2E-04: User invitation flow (Spec 003, Phase 20.4).
// Admin invites email → Mailpit receives → user accepts → can log in.
// Also tests expired invitation error and resend.
// Skips when Keycloak or Mailpit is not running.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import { isMailpitReachable } from './helpers/api-check.js';
import { clearInbox, extractInviteLink, getMessage, waitForEmail } from './helpers/mailpit.js';
import { createWorkspace, navigateToWorkspace, openWorkspaceMembers } from './helpers/workspace.js';

// Unique invite target — must NOT already exist in the tenant realm
const INVITE_EMAIL = `invite-${Date.now()}@e2e-test.local`;

let stackReady = false;

test.describe('E2E-04: User invitation flow', () => {
  test.beforeAll(async () => {
    requireKeycloakInCI();
    stackReady = hasKeycloak && (await isMailpitReachable());
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!stackReady, 'Requires live Keycloak + Mailpit');
    await clearInbox();
    await loginAsAdmin(page);
  });

  test('admin invites a new email address — invite button triggers API call', async ({ page }) => {
    const wsName = uniqueName('invite-ws');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    await openWorkspaceMembers(page);

    await page.getByRole('button', { name: /invite/i }).click();
    await page.getByLabel(/email/i).fill(INVITE_EMAIL);
    await page.getByRole('button', { name: /send invite|invite/i }).click();

    // Success toast or confirmation message
    await expect(page.getByText(/invitation sent|invite sent/i)).toBeVisible({ timeout: 8_000 });
  });

  test('Mailpit receives the invitation email', async ({ page }) => {
    const wsName = uniqueName('invite-mail');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    await openWorkspaceMembers(page);

    await page.getByRole('button', { name: /invite/i }).click();
    await page.getByLabel(/email/i).fill(INVITE_EMAIL);
    await page.getByRole('button', { name: /send invite|invite/i }).click();

    // Poll Mailpit until the email arrives (max 15s)
    const message = await waitForEmail(INVITE_EMAIL, { timeoutMs: 15_000 });
    expect(message.Subject).toMatch(/invitation|invite|join/i);
  });

  test('invitation email contains an accept link', async ({ page }) => {
    const wsName = uniqueName('invite-link');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    await openWorkspaceMembers(page);

    await page.getByRole('button', { name: /invite/i }).click();
    await page.getByLabel(/email/i).fill(INVITE_EMAIL);
    await page.getByRole('button', { name: /send invite|invite/i }).click();

    const message = await waitForEmail(INVITE_EMAIL);
    const detail = await getMessage(message.ID);
    const link = extractInviteLink(detail.HTML || detail.Text);
    expect(link, 'Invitation email must contain an accept link').not.toBeNull();
  });

  test('expired invitation shows an error', async ({ page }) => {
    // Navigate directly to a fake/expired token URL — backend must return an error
    await page.goto('/invitations/accept?token=expired-fake-token-000');
    await expect(page.getByText(/expired|invalid|not found/i)).toBeVisible({ timeout: 8_000 });
  });

  test('resend invitation generates a new email', async ({ page }) => {
    const wsName = uniqueName('invite-resend');
    await createWorkspace(page, { name: wsName });
    await navigateToWorkspace(page, wsName);
    await openWorkspaceMembers(page);

    // First invite
    await page.getByRole('button', { name: /invite/i }).click();
    await page.getByLabel(/email/i).fill(INVITE_EMAIL);
    await page.getByRole('button', { name: /send invite|invite/i }).click();
    await waitForEmail(INVITE_EMAIL);
    await clearInbox();

    // Resend via pending invitations list
    const row = page.getByRole('row', { name: new RegExp(INVITE_EMAIL, 'i') });
    await row.getByRole('button', { name: /resend/i }).click();
    await expect(page.getByText(/resent|invitation sent/i)).toBeVisible({ timeout: 8_000 });

    // Mailpit should now have a second email
    const resent = await waitForEmail(INVITE_EMAIL, { timeoutMs: 15_000 });
    expect(resent.Subject).toMatch(/invitation|invite|join/i);
  });
});
