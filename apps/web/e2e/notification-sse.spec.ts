// notification-sse.spec.ts
// E2E 006-01: a workspace invite targeting an EXISTING tenant user is
// delivered to that user's open app session via SSE in < 2s (NFR-006-2).
// The member runs in its own browser context so its SSE connection is live
// while the admin (fixture page) triggers the invite via the API.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  loginAsMember,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import { isApiReachable } from './helpers/api-check.js';
import { applyPageFixes, isolatedTestIp } from './helpers/page-fixes.js';
import { createWorkspace } from './helpers/workspace.js';
import {
  clearNotifications,
  inviteExistingUser,
  waitForUnreadBadge,
} from './helpers/sse-asserts.js';

let stackReady = false;

test.describe('E2E 006-01: Notification SSE delivery', () => {
  test.beforeAll(async () => {
    requireKeycloakInCI();
    stackReady = hasKeycloak && (await isApiReachable());
    if (process.env['CI'] !== undefined && !stackReady) {
      throw new Error('CI requires live Keycloak + core-api for the SSE flow.');
    }
  });

  test('invite of an existing user is delivered to the UI via SSE in < 2s', async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(!stackReady, 'Requires live Keycloak + core-api');

    await loginAsAdmin(page);

    // Member session in its OWN context — the fixture page stays the admin.
    const memberContext = await browser.newContext({
      extraHTTPHeaders: {
        'X-Forwarded-For': isolatedTestIp(`${testInfo.testId}:member`, testInfo.retry),
      },
    });
    try {
      const memberPage = await memberContext.newPage();
      await applyPageFixes(memberPage);
      await loginAsMember(memberPage);
      // Clear accumulated unread rows + reload so the badge is hidden at start —
      // otherwise the < 2s timing assertion measures a stale already-visible
      // badge (M5) instead of real SSE delivery.
      await clearNotifications(memberPage);
      await memberPage.reload();

      // Admin creates a workspace and invites the already-logged-in member.
      const wsId = await createWorkspace(page, { name: uniqueName('sse-ws') });
      await inviteExistingUser(page, wsId, 'member@e2e.local');

      // The member's app session is connected to the SSE stream — the badge
      // must appear within the 2s delivery NFR (event → UI).
      const deliveryMs = await waitForUnreadBadge(memberPage, { timeoutMs: 2_000 });
      expect(deliveryMs).toBeLessThan(2_000);
    } finally {
      await memberContext.close();
    }
  });

  test('the notification center lists the SSE-delivered invite', async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(!stackReady, 'Requires live Keycloak + core-api');

    await loginAsAdmin(page);
    const memberContext = await browser.newContext({
      extraHTTPHeaders: {
        'X-Forwarded-For': isolatedTestIp(`${testInfo.testId}:member2`, testInfo.retry),
      },
    });
    try {
      const memberPage = await memberContext.newPage();
      await applyPageFixes(memberPage);
      await loginAsMember(memberPage);
      await clearNotifications(memberPage);
      await memberPage.reload();

      const wsId = await createWorkspace(page, { name: uniqueName('sse-center') });
      await inviteExistingUser(page, wsId, 'member@e2e.local');
      await waitForUnreadBadge(memberPage, { timeoutMs: 2_000 });

      // Open the center on the member page — the invite row must be present.
      await memberPage.goto('/notifications');
      await expect(memberPage.getByTestId('notification-item').first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(
        memberPage.getByText('You have been invited to a workspace').first()
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await memberContext.close();
    }
  });
});
