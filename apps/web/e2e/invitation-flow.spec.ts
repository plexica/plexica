// invitation-flow.spec.ts
// E2E-04: User invitation flow (Spec 003, Phase 20.4).
// Admin invites email → dialog closes → pending invitation visible → Mailpit receives email.
// Also tests expired invitation token handling.
// Resend test is skipped — no resend button in the current members page UI.
// Skips when Keycloak or Mailpit is not running.

import { expect, test } from './helpers/base-fixture.js';
import {
  ADMIN_TENANT_SLUG,
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import { isMailpitReachable } from './helpers/api-check.js';
import { clearInbox, extractInviteLink, getMessage, waitForEmail } from './helpers/mailpit.js';
import {
  createWorkspace,
  navigateToWorkspaceById,
  openWorkspaceMembers,
} from './helpers/workspace.js';
import { sendInviteViaUi } from './helpers/workspace-members.js';
import { tenantApiUrl } from './helpers/tenant-hosts.js';

let stackReady = false;

test.describe('E2E-04: User invitation flow', () => {
  test.beforeAll(async () => {
    requireKeycloakInCI();
    stackReady = hasKeycloak && (await isMailpitReachable());
    if (process.env['CI'] !== undefined && !stackReady) {
      throw new Error('CI requires live Keycloak and Mailpit for the invitation E2E flow.');
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!stackReady, 'Requires live Keycloak + Mailpit');
    await clearInbox();
    await loginAsAdmin(page);
  });

  test('admin invites a new email — dialog closes and pending invitation appears', async ({
    page,
  }) => {
    const wsName = uniqueName('invite-ws');
    const inviteEmail = `invite-${Date.now()}@e2e-test.local`;
    const id = await createWorkspace(page, { name: wsName });
    await navigateToWorkspaceById(page, id);
    await openWorkspaceMembers(page);

    // Send invitation via the UI helper (handles dialog interaction)
    await sendInviteViaUi(page, inviteEmail, 'member');

    // After the dialog closes, the pending invitation should appear.
    // Note: The backend masks emails for security (e.g., "i***@e2e-test.local"),
    // so we look for the "Invitation pending" section heading instead.
    await expect(page.getByRole('heading', { name: /invitation pending/i })).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Mailpit receives the invitation email', async ({ page }) => {
    const wsName = uniqueName('invite-mail');
    const inviteEmail = `invite-mail-${Date.now()}@e2e-test.local`;
    const id = await createWorkspace(page, { name: wsName });
    await navigateToWorkspaceById(page, id);
    await openWorkspaceMembers(page);

    await sendInviteViaUi(page, inviteEmail, 'member');

    // Poll Mailpit until the email arrives (max 15s)
    const message = await waitForEmail(inviteEmail, { timeoutMs: 15_000 });
    expect(message.Subject).toMatch(/invitation|invite|join/i);
  });

  test('public invitation acceptance succeeds once', async ({ page }) => {
    const wsName = uniqueName('invite-link');
    const inviteEmail = `invite-link-${Date.now()}@e2e-test.local`;
    const id = await createWorkspace(page, { name: wsName });
    await navigateToWorkspaceById(page, id);
    await openWorkspaceMembers(page);

    await sendInviteViaUi(page, inviteEmail, 'member');

    const message = await waitForEmail(inviteEmail);
    const detail = await getMessage(message.ID);
    const link = extractInviteLink(detail.HTML || detail.Text);
    expect(link, 'Invitation email must contain an accept link').not.toBeNull();

    const token = link === null ? '' : new URL(link).pathname.split('/').pop();
    expect(token).toBeTruthy();
    const acceptUrl = tenantApiUrl(ADMIN_TENANT_SLUG, `/api/v1/invitations/${token ?? ''}/accept`);
    const accepted = await page.request.post(acceptUrl);
    expect(accepted.status()).toBe(200);
    expect(await accepted.json()).toMatchObject({ workspaceId: id, role: 'member' });

    const replay = await page.request.post(acceptUrl);
    expect(replay.status()).toBe(409);
    expect(await replay.json()).toMatchObject({
      error: { code: 'INVITATION_ALREADY_ACCEPTED' },
    });
  });

  test('invalid public invitation token returns the generic error', async ({ page }) => {
    const response = await page.request.post(
      tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/invitations/invalid-e2e-token/accept')
    );
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'INVITATION_NOT_FOUND' } });
  });
});
