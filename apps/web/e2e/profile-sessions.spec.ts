// profile-sessions.spec.ts
// E2E 006-13/14: active session management + password-change entry point.
// Sessions listed (API + card), foreign/unknown revoke → 404 (F4, no
// enumeration), self-revoke → forced re-login, password link → Keycloak
// account console. API helpers live in helpers/profile-sessions.ts (Rule 4).

import { randomUUID } from 'node:crypto';

import { expect, test } from './helpers/base-fixture.js';
import {
  ADMIN_TENANT_SLUG,
  hasKeycloak,
  loginAsAdmin,
  loginAsMember,
  requireKeycloakInCI,
} from './helpers/admin-login.js';
import { isApiReachable } from './helpers/api-check.js';
import { listSessions, readProfile } from './helpers/profile-sessions.js';
import { freshBearer } from './helpers/session-token.js';
import { tenantApiUrl } from './helpers/tenant-hosts.js';

test.describe('E2E 006-13/14: Profile sessions', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    if (!(await isApiReachable())) throw new Error('Requires live core-api.');
    await loginAsAdmin(page);
  });

  test('sessions listed with shape; exactly the current one flagged', async ({ page }) => {
    const sessions = await listSessions(page);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    for (const session of sessions) {
      expect(session.id).toBeTruthy();
      expect(session.clientId).toBeTruthy();
      expect(Date.parse(session.startedAt)).not.toBeNaN();
      expect(Date.parse(session.lastSeenAt)).not.toBeNaN();
      expect(typeof session.current).toBe('boolean');
    }
    // The `sid` claim marks the acting session — exactly one is current.
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    const acting = sessions.find((s) => s.current);
    expect(acting?.clientId).toBeTruthy();

    // The card renders the same list. Totals are NOT compared across the two
    // reads: the API list above and the card below run at different times
    // against a shared Keycloak account, so another sign-in/revoke in between
    // would flake an equality check. Instead the acting session must appear
    // and be marked current.
    await page.goto('/profile');
    await expect(page.getByTestId('session-item').first()).toBeVisible({ timeout: 15_000 });
    const currentCard = page.locator('[data-testid="session-item"][data-current="true"]');
    await expect(currentCard).toHaveCount(1);
    await expect(currentCard).toContainText(acting?.clientId ?? '');
  });

  test('revoking an unknown session id → 404 NOT_FOUND (no enumeration)', async ({ page }) => {
    const res = await page.request.delete(
      tenantApiUrl(ADMIN_TENANT_SLUG, `/api/v1/profile/sessions/${randomUUID()}`),
      {
        headers: { ...(await freshBearer(page)), 'X-Tenant-Slug': ADMIN_TENANT_SLUG },
        // Fastify rejects application/json with an empty body (400
        // FST_ERR_CTP_EMPTY_JSON_BODY); freshBearer always sets the JSON
        // content type, so send an explicit empty object like the UI client.
        data: {},
      }
    );
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  test("revoking another user's session → 404 (F4 ownership-first)", async ({ page, browser }) => {
    const context = await browser.newContext();
    try {
      const memberPage = await context.newPage();
      await loginAsMember(memberPage);
      const memberSessions = await listSessions(memberPage);
      expect(memberSessions.length).toBeGreaterThanOrEqual(1);
      const foreignId = memberSessions[0]?.id ?? '';
      expect(foreignId).toBeTruthy();

      // Admin revokes the member's session id → 404, never proxied to Keycloak.
      const res = await page.request.delete(
        tenantApiUrl(ADMIN_TENANT_SLUG, `/api/v1/profile/sessions/${foreignId}`),
        {
          headers: { ...(await freshBearer(page)), 'X-Tenant-Slug': ADMIN_TENANT_SLUG },
          // Explicit empty JSON body (see above): no body + JSON content
          // type would 400 before the ownership check runs.
          data: {},
        }
      );
      expect(res.status()).toBe(404);

      // The member session survived (ownership gate ran before the KC call).
      expect((await listSessions(memberPage)).some((s) => s.id === foreignId)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('revoking the current session forces re-login', async ({ page }) => {
    // UI path: the card passes current:true, so the mutation signs out locally
    // after Keycloak confirms — the user lands back in the Keycloak login flow.
    await page.goto('/profile');
    const currentItem = page.locator('[data-testid="session-item"][data-current="true"]');
    await expect(currentItem).toHaveCount(1, { timeout: 15_000 });
    await currentItem.getByRole('button', { name: /revoke/i }).click();
    await page.waitForURL(/\/realms\//, { timeout: 15_000 });
    // The Keycloak logout endpoint also matches /realms/ — the realm URL alone
    // does not prove revocation. The sign-in form must be back: the revoked
    // session can no longer reach the app without re-authenticating.
    await expect(page.locator('input[name="username"]')).toBeVisible({ timeout: 15_000 });
  });

  test('password link points at the Keycloak account console (006-14)', async ({ page }) => {
    const profile = await readProfile(page);
    expect(profile.keycloakAccountUrl).toMatch(/\/realms\/.+\/account/);

    await page.goto('/profile');
    const link = page.getByTestId('password-change-link');
    await expect(link).toBeVisible({ timeout: 15_000 });
    await expect(link).toHaveAttribute('href', profile.keycloakAccountUrl);
    await expect(link).toHaveAttribute('target', '_blank');
  });
});
