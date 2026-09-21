// notification-prefs.spec.ts
// E2E 006-04: per-type notification preferences. Toggling the email channel ON
// delivers the invite email; toggling it OFF suppresses the email while the
// in-app notification still lands. Prefs save round-trip < 300ms (NFR-006-6).
// The member's OWN prefs decide delivery, so toggles happen on the member
// session; the admin drives invites.

import { expect, test } from './helpers/base-fixture.js';
import {
  ADMIN_TENANT_SLUG,
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import { isApiReachable, isMailpitReachable } from './helpers/api-check.js';
import { clearInbox, listMessages, waitForEmail } from './helpers/mailpit.js';
import { createWorkspace } from './helpers/workspace.js';
import { freshBearer } from './helpers/session-token.js';
import { tenantApiUrl } from './helpers/tenant-hosts.js';
import {
  clearNotifications,
  inviteExistingUser,
  openMemberSession,
  waitForUnreadBadge,
} from './helpers/sse-asserts.js';

import type { Page } from '@playwright/test';

let stackReady = false;

/**
 * Seeds the member's workspace.invite email preference to a KNOWN state via the
 * API before the UI toggle (review finding — the toggle determinism bug): the
 * second test previously relied on the first test's persisted toggle, which is
 * order-dependent and flakes on a dirty DB between CI runs.
 */
async function setInviteEmailPref(page: Page, email: boolean): Promise<void> {
  const res = await page.request.patch(
    tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/notifications/preferences'),
    {
      headers: { ...(await freshBearer(page)), 'Content-Type': 'application/json' },
      data: { types: { 'workspace.invite': { inApp: true, email } } },
    }
  );
  expect(res.status()).toBe(200);
}

test.describe('E2E 006-04: Notification preferences', () => {
  test.beforeAll(async () => {
    requireKeycloakInCI();
    stackReady = hasKeycloak && (await isApiReachable()) && (await isMailpitReachable());
    if (process.env['CI'] !== undefined && !stackReady) {
      throw new Error('CI requires live Keycloak + core-api + Mailpit for the prefs flow.');
    }
  });

  test('toggle email ON for workspace.invite → invite email delivered; save < 300ms', async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(!stackReady, 'Requires live Keycloak + core-api + Mailpit');
    await loginAsAdmin(page);
    await clearInbox();

    const member = await openMemberSession(browser, testInfo);
    try {
      await clearNotifications(member.page);
      // Start with the invite email channel OFF so the UI toggle is a single,
      // deterministic ON click.
      await setInviteEmailPref(member.page, false);
      await member.page.reload();

      // Toggle email ON for the invite type through the UI.
      await member.page.goto('/notifications/preferences');
      const inviteSection = member.page.getByTestId('prefs-type-workspace.invite');
      await inviteSection.getByText('Email', { exact: true }).click();
      await member.page.getByRole('button', { name: /save preferences/i }).click();
      await expect(member.page.getByText('Preferences saved')).toBeVisible({ timeout: 5_000 });

      // NFR-006-6: a direct prefs PATCH round-trip stays under 300ms.
      const started = Date.now();
      const res = await member.page.request.patch(
        tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/notifications/preferences'),
        {
          headers: { ...(await freshBearer(member.page)), 'Content-Type': 'application/json' },
          data: { defaults: { inApp: true, email: true } },
        }
      );
      expect(res.status()).toBe(200);
      expect(Date.now() - started).toBeLessThan(300);

      const wsId = await createWorkspace(page, { name: uniqueName('prefs-on') });
      await inviteExistingUser(page, wsId, 'member@e2e.local');

      const message = await waitForEmail('member@e2e.local', { timeoutMs: 15_000 });
      expect(message.Subject).toMatch(/invitation|invite|join/i);
    } finally {
      await member.close();
    }
  });

  test('email OFF → invite suppressed, in-app notification still delivered', async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(!stackReady, 'Requires live Keycloak + core-api + Mailpit');
    await loginAsAdmin(page);
    await clearInbox();

    const member = await openMemberSession(browser, testInfo);
    try {
      await clearNotifications(member.page);
      // Start with the invite email channel ON so the UI toggle is a single,
      // deterministic OFF click.
      await setInviteEmailPref(member.page, true);
      await member.page.reload();

      // Toggle email OFF for the invite type through the UI.
      await member.page.goto('/notifications/preferences');
      const inviteSection = member.page.getByTestId('prefs-type-workspace.invite');
      await inviteSection.getByText('Email', { exact: true }).click();
      await member.page.getByRole('button', { name: /save preferences/i }).click();
      await expect(member.page.getByText('Preferences saved')).toBeVisible({ timeout: 5_000 });

      const wsId = await createWorkspace(page, { name: uniqueName('prefs-off') });
      await inviteExistingUser(page, wsId, 'member@e2e.local');

      // In-app notification delivered via SSE.
      await waitForUnreadBadge(member.page, { timeoutMs: 2_000 });

      // No email for the member within a bounded window.
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const messages = await listMessages();
        const hit = messages.some((m) =>
          m.To.some((t) => t.Address.toLowerCase() === 'member@e2e.local')
        );
        expect(hit, 'email channel is OFF — no mail must be sent to the member').toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      await member.close();
    }
  });
});
