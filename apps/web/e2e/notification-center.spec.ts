// notification-center.spec.ts
// E2E 006-02: the notification center — open, unread badge, mark read,
// mark all as read. Runs against the MEMBER session (its own context) because
// the center lists the caller's own notifications; the admin drives invites.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import { isApiReachable } from './helpers/api-check.js';
import { createWorkspace } from './helpers/workspace.js';
import {
  clearNotifications,
  inviteExistingUser,
  openMemberSession,
  waitForUnreadBadge,
} from './helpers/sse-asserts.js';

let stackReady = false;

test.describe('E2E 006-02: Notification center', () => {
  test.beforeAll(async () => {
    requireKeycloakInCI();
    stackReady = hasKeycloak && (await isApiReachable());
    // Missing infra is a hard FAILURE, never a silent skip (false-green guard).
    if (!stackReady) {
      throw new Error('Requires live Keycloak + core-api for the center flow.');
    }
  });

  test('open center, see the invite, mark it read', async ({ page, browser }, testInfo) => {
    await loginAsAdmin(page);

    const member = await openMemberSession(browser, testInfo);
    try {
      // Deterministic start: clear the member's accumulated unread rows (M5) and
      // reload so the unread query refetches from the cleared state.
      await clearNotifications(member.page);
      await member.page.reload();

      const wsId = await createWorkspace(page, { name: uniqueName('center-ws') });
      await inviteExistingUser(page, wsId, 'member@e2e.local');
      await waitForUnreadBadge(member.page, { timeoutMs: 2_000 });

      // Open the center — the invite row is listed and unread.
      await member.page.goto('/notifications');
      const item = member.page.getByTestId('notification-item').first();
      await expect(item).toBeVisible({ timeout: 5_000 });
      await expect(item.getByText('You have been invited to a workspace')).toBeVisible();

      // Mark read — the unread badge disappears (unread count reaches 0).
      await item.getByRole('button', { name: /mark as read/i }).click();
      await expect(member.page.getByTestId('notification-badge')).toHaveCount(0, {
        timeout: 5_000,
      });
    } finally {
      await member.close();
    }
  });

  test('mark all as read clears the badge', async ({ page, browser }, testInfo) => {
    await loginAsAdmin(page);

    const member = await openMemberSession(browser, testInfo);
    try {
      await clearNotifications(member.page);
      await member.page.reload();

      // Two invites → unread badge count >= 2. Asserted as a lower bound: the
      // member may hold other unread rows from unrelated flows on a fresh CI
      // run (M5 — exact counts flake).
      const wsA = await createWorkspace(page, { name: uniqueName('readall-a') });
      await inviteExistingUser(page, wsA, 'member@e2e.local');
      await waitForUnreadBadge(member.page, { timeoutMs: 2_000 });
      const wsB = await createWorkspace(page, { name: uniqueName('readall-b') });
      await inviteExistingUser(page, wsB, 'member@e2e.local');
      await expect
        .poll(async () =>
          Number((await member.page.getByTestId('notification-badge').textContent()) ?? '0')
        )
        .toBeGreaterThanOrEqual(2);

      await member.page.goto('/notifications');
      await member.page.getByTestId('mark-all-read').click();
      await expect(member.page.getByTestId('notification-badge')).toHaveCount(0, {
        timeout: 5_000,
      });
    } finally {
      await member.close();
    }
  });
});
