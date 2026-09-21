// notification-email.spec.ts
// E2E 006-03: invitation email is delivered through the durable retry queue to
// Mailpit (dev/CI SMTP mock). The retry + dead-letter EXECUTION path (4
// attempts, 1s/4s/16s backoff, dead status) cannot be driven deterministically
// against a Mailpit that always accepts SMTP — it is covered by the backend
// integration suite (email-queue.service.test.ts, real SMTP).

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, requireKeycloakInCI, uniqueName, hasKeycloak } from './helpers/admin-login.js';
import { isApiReachable, isMailpitReachable } from './helpers/api-check.js';
import { clearInbox, getMessage, waitForEmail } from './helpers/mailpit.js';
import { createWorkspace } from './helpers/workspace.js';
import { inviteExistingUser } from './helpers/sse-asserts.js';

let stackReady = false;

test.describe('E2E 006-03: Notification email delivery', () => {
  test.beforeAll(async () => {
    requireKeycloakInCI();
    stackReady = hasKeycloak && (await isApiReachable()) && (await isMailpitReachable());
    if (process.env['CI'] !== undefined && !stackReady) {
      throw new Error('CI requires live Keycloak + core-api + Mailpit for the email flow.');
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!stackReady, 'Requires live Keycloak + core-api + Mailpit');
    await clearInbox();
    await loginAsAdmin(page);
  });

  test('inviting a non-tenant email delivers the accept-link message to Mailpit', async ({
    page,
  }) => {
    const wsId = await createWorkspace(page, { name: uniqueName('email-ws') });
    const inviteeEmail = `invite-email-${Date.now()}@e2e-test.local`;
    await inviteExistingUser(page, wsId, inviteeEmail);

    const message = await waitForEmail(inviteeEmail, { timeoutMs: 15_000 });
    expect(message.Subject).toMatch(/invitation|invite|join/i);

    // The body must carry the accept link (the durable-queue payload).
    const detail = await getMessage(message.ID);
    const link = (detail.HTML || detail.Text).match(/https?:\/\/[^\s"'<]+\/invite\/[^\s"'<]*/);
    expect(link).not.toBeNull();
  });
});