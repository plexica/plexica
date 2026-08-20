// user-removal.spec.ts
// E2E-05b: tenant user removal — the destructive half of user management.
//
// COVERAGE GAP THIS CLOSES: the four "remove user" tests in
// user-management.spec.ts exercise only the TypeToConfirmDialog widget (dialog
// opens, wrong text keeps the button disabled, "CONFIRM" enables it, cancel
// resets). None of them ever clicks the enabled button, so DELETE
// /api/v1/users/:id was never issued by any test — the most destructive and most
// GDPR-relevant operation of the module had zero end-to-end coverage
// (Constitution Rule 1).
//
// This spec completes the removal for real and asserts its three observable
// effects:
//   1. the DELETE round-trip returns its documented status (204, routes.ts:65);
//   2. the access token the user was holding immediately loses workspace write
//      access (403), via the fail-closed backstop in userProfileResolver
//      (middleware/user-profile-resolver.ts) — see the assertion's comment for
//      why this is NOT proof of ABAC cache revocation (covered by a dedicated
//      backend integration test);
//   3. the user is gone from GET /api/v1/users.
//
// Lives in its own file because user-management.spec.ts is already close to the
// 200-line ceiling and this flow would push it over (Constitution Rule 4).

import { expect, test } from './helpers/base-fixture.js';
import { expectApiStatus, expectResponseTo } from './helpers/api-response.js';
import {
  ADMIN_TENANT_SLUG,
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import {
  createDisposableUser,
  deleteDisposableUser,
  openDisposableSession,
} from './helpers/disposable-user.js';
import { freshBearer } from './helpers/session-token.js';
import { tenantApiUrl } from './helpers/tenant-hosts.js';
import { addMemberViaApi } from './helpers/workspace-members.js';
import { createWorkspace } from './helpers/workspace.js';

import type { Page } from './helpers/base-fixture.js';
import type { APIResponse, TestInfo } from '@playwright/test';

const USERS_PATH = '/api/v1/users';

/**
 * Runs a teardown step, reporting a failure as an annotation instead of throwing.
 * A throwing `finally` would replace the test's own failure with the teardown
 * error and hide what actually broke.
 */
async function safely(testInfo: TestInfo, label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    testInfo.annotations.push({ type: `teardown-failed:${label}`, description: String(error) });
  }
}

/**
 * GET on a tenant API path as the session logged in on `page`, with a token
 * minted for this call — see session-token.ts on the 60 s access-token TTL.
 */
async function apiGet(page: Page, path: string): Promise<APIResponse> {
  return page.request.get(tenantApiUrl(ADMIN_TENANT_SLUG, path), {
    headers: await freshBearer(page),
  });
}

/** Search term isolating exactly the disposable user in the tenant user list. */
function searchFor(tag: string): string {
  return `${USERS_PATH}?search=${encodeURIComponent(tag)}`;
}

/** Resolves the tenant-internal user_profile id of the disposable user. */
async function findTenantUserId(page: Page, tag: string): Promise<string> {
  const response = await apiGet(page, searchFor(tag));
  await expectApiStatus(response, 200);
  const body = (await response.json()) as { data: Array<{ userId: string; email: string }> };
  expect(body.data, `exactly one tenant user must carry the tag ${tag}`).toHaveLength(1);
  return body.data[0]?.userId ?? '';
}

test.describe('E2E-05b: Tenant user removal', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('remove user — DELETE completes, the user disappears and their token loses write access', async ({
    page,
    browser,
  }, testInfo) => {
    // Two real Keycloak logins, a workspace creation and a full UI removal do not
    // fit the 30 s default budget. This is a deadline, not a sleep.
    test.setTimeout(180_000);

    const workspaceId = await createWorkspace(page, { name: uniqueName('ws-removal') });
    const workspaceUrl = tenantApiUrl(ADMIN_TENANT_SLUG, `/api/v1/workspaces/${workspaceId}`);

    const victim = await createDisposableUser(ADMIN_TENANT_SLUG, 'rmuser');
    // Teardown is paired with creation right away: if `openDisposableSession`
    // throws below (slow Keycloak login, tokens not persisted), this `finally`
    // still runs and the Keycloak account does not leak.
    try {
      const session = await openDisposableSession(browser, testInfo, ADMIN_TENANT_SLUG, victim);
      try {
        // The tenant-schema user_profile row is created by the JIT resolver on
        // the first authenticated tenant request, not by the Keycloak account
        // itself; doing it explicitly makes the /users lookup below deterministic.
        await expectApiStatus(await apiGet(session.page, '/api/v1/profile'), 200);

        const victimUserId = await findTenantUserId(page, victim.tag);
        // Workspace-ADMIN role: `workspace:update` requires it (abac/policies.ts),
        // so the pre-removal 200 below really proves write access.
        await addMemberViaApi(page, workspaceId, victimUserId, 'admin');

        // ── Removal, driven entirely through the UI ───────────────────────
        await page.goto('/users');
        const main = page.locator('main');
        await main.getByRole('searchbox').fill(victim.tag);
        const row = main.getByRole('row', { name: new RegExp(victim.tag) });
        await expect(row).toBeVisible({ timeout: 8_000 });

        await row.getByRole('button', { name: /^remove /i }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5_000 });
        await dialog.getByLabel(/type confirm/i).fill('CONFIRM');
        const confirmButton = dialog.getByRole('button', { name: /delete/i });
        await expect(confirmButton).toBeEnabled({ timeout: 2_000 });

        // Minted here, with the dialog already armed, so only the DELETE itself
        // sits between the token and its two assertions: tenant realms issue
        // 60 s access tokens, and an expired one would answer 401 instead of
        // the 403 we assert.
        const write = {
          headers: await freshBearer(session.page),
          data: { name: uniqueName('ws-by-victim') },
        };

        // Positive control: the victim CAN write right now. Without it a later
        // 403 would prove nothing — a typo in the URL produces one too. It also
        // warms the Redis ABAC membership cache (300 s TTL), which is exactly
        // the state the revocation assertion must defeat.
        await expectApiStatus(await session.page.request.patch(workspaceUrl, write), 200);

        // The real thing: click the enabled button and wait for the DELETE.
        await expectResponseTo(
          page,
          `${USERS_PATH}/${victimUserId}`,
          'DELETE',
          async () => {
            await confirmButton.click();
          },
          204
        );

        // ── Effect 1: authorization revoked, not merely expired ───────────
        // Asserted right after the DELETE round-trip, before the multi-second
        // UI waits below: that keeps the token's remaining life to a single
        // HTTP call instead of risking it against the 60 s access-token TTL,
        // which would turn this into a 401 (expired) instead of the 403 we
        // want. The token is still cryptographically valid — auth-middleware.ts
        // verifies RS256 offline against the JWKS and never introspects, so
        // Keycloak disabling the account cannot by itself cause this. The 403
        // instead proves the fail-closed backstop in userProfileResolver
        // (middleware/user-profile-resolver.ts) rejected the soft-deleted
        // profile: that scope-level preHandler runs before requireAbac, which
        // is never reached here. This does NOT exercise ABAC membership cache
        // revocation (`revokeAbacMemberships`) — see the dedicated backend
        // integration test for that. A 401 would mean the token expired and
        // nothing was proven; a 200 would mean write access was retained.
        await expectApiStatus(await session.page.request.patch(workspaceUrl, write), 403);

        // ── Effect 2: gone from the UI ─────────────────────────────────────
        await expect(dialog).toBeHidden({ timeout: 10_000 });
        await expect(row).toBeHidden({ timeout: 10_000 });
        // i18n: users.list.empty = 'No users yet' — the filtered list is empty.
        await expect(main.getByText(/no users yet/i)).toBeVisible({ timeout: 10_000 });

        // ── Effect 3: gone from the API ─────────────────────────────────────
        const listAfter = await apiGet(page, searchFor(victim.tag));
        await expectApiStatus(listAfter, 200);
        expect(await listAfter.json()).toMatchObject({ data: [], total: 0 });
      } finally {
        await safely(testInfo, 'session', () => session.close());
      }
    } finally {
      await safely(testInfo, 'keycloak-user', () => deleteDisposableUser(victim));
    }
  });
});
