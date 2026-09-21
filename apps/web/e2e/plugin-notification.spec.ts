// plugin-notification.spec.ts
// E2E 006-05: a plugin notification emission is acknowledged synchronously
// (202 accepted) and delivered to the UI (row + SSE) through the real consumer
// pipeline. Uses the JWT path of POST /notifications/emit with the CRM plugin
// installed — the same path the SDK's emitNotification drives with a plugin
// service identity.

import { expect, test } from './helpers/base-fixture.js';
import {
  ADMIN_TENANT_SLUG,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
  hasKeycloak,
} from './helpers/admin-login.js';
import { isApiReachable } from './helpers/api-check.js';
import { ensureCrmInstalled } from './helpers/crm-plugin-fixture.js';
import { refreshBrowserToken } from './helpers/keycloak-token.js';
import { createWorkspace } from './helpers/workspace.js';
import { freshBearer } from './helpers/session-token.js';
import { tenantApiUrl } from './helpers/tenant-hosts.js';
import {
  currentUserId,
  clearNotifications,
  emitPluginNotification,
  waitForUnreadBadge,
} from './helpers/sse-asserts.js';

let stackReady = false;

test.describe('E2E 006-05: Plugin notification emission', () => {
  test.beforeAll(async () => {
    requireKeycloakInCI();
    stackReady = hasKeycloak && (await isApiReachable());
    if (process.env['CI'] !== undefined && !stackReady) {
      throw new Error('CI requires live Keycloak + core-api for the plugin flow.');
    }
  });

  test('CRM plugin emits on contact → 202 accepted, row + SSE in the UI', async ({ page }) => {
    test.skip(!stackReady, 'Requires live Keycloak + core-api');

    await loginAsAdmin(page);

    // Deterministic unread state (M5) so the badge presence below proves the
    // emission actually delivered.
    await clearNotifications(page);
    await page.reload();

    // Ensure the CRM plugin is installed (006-05 requires verifyPluginInstalled).
    const token = await refreshBrowserToken(page);
    await ensureCrmInstalled(page, token);

    // Acting user = the admin (internal user_profile.user_id for the FK).
    const userId = await currentUserId(page);
    await createWorkspace(page, { name: uniqueName('plugin-notif') });

    // Emission is acknowledged synchronously with a generated notificationId.
    const { notificationId, latencyMs } = await emitPluginNotification(page, {
      userId,
      type: 'plugin.crm.contact_created',
      titleKey: 'notifications.plugin.crm.contact_created.title',
      metadata: { link: '/contacts/123' },
    });
    expect(notificationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(latencyMs).toBeLessThan(5_000);

    // The consumer persists the row and pushes SSE to the admin's open session.
    await waitForUnreadBadge(page, { timeoutMs: 2_000 });

    await page.goto('/notifications');
    await expect(page.getByTestId('notification-item').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('New contact:').first()).toBeVisible({ timeout: 5_000 });
  });

  test('unregistered plugin slug is rejected (422, VALIDATION_ERROR)', async ({ page }) => {
    test.skip(!stackReady, 'Requires live Keycloak + core-api');

    await loginAsAdmin(page);
    const userId = await currentUserId(page);

    const res = await page.request.post(
      tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/notifications/emit'),
      {
        headers: { ...(await freshBearer(page)), 'X-Tenant-Slug': ADMIN_TENANT_SLUG },
        data: {
          userId,
          type: 'plugin.ghost.contact_created',
          titleKey: 'notifications.plugin.crm.contact_created.title',
          timestamp: new Date().toISOString(),
          correlationId: crypto.randomUUID(),
        },
      }
    );
    expect(res.status()).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });
});
