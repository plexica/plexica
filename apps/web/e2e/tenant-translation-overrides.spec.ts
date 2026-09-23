// tenant-translation-overrides.spec.ts
// E2E 006-10: a tenant admin overrides an interface key via the translations
// settings page; a regular tenant user sees the override after the shell boot
// merge (precedence: overrides > plugin > core); reverting restores default.
// Also pins the authorization boundary: PUT is tenant_admin-only (403 for a
// member).

import { expect, test } from './helpers/base-fixture.js';
import {
  ADMIN_TENANT_SLUG,
  hasKeycloak,
  loginAsAdmin,
  loginAsMember,
  requireKeycloakInCI,
} from './helpers/admin-login.js';
import { isApiReachable } from './helpers/api-check.js';
import { openMemberSession } from './helpers/sse-asserts.js';
import { freshBearer } from './helpers/session-token.js';
import { tenantApiUrl } from './helpers/tenant-hosts.js';
import { ensureNoOverride, TRANSLATIONS_PATH } from './helpers/translation-overrides.js';

const OVERRIDE_KEY = 'nav.workspaces';

let stackReady = false;

test.describe('E2E 006-10: tenant translation overrides', () => {
  test.beforeAll(async () => {
    requireKeycloakInCI();
    stackReady = hasKeycloak && (await isApiReachable());
    if (!stackReady) {
      throw new Error('Requires live Keycloak + core-api for the translation overrides flow.');
    }
  });

  test('regular user cannot write overrides (403); any user can read them', async ({ page }) => {
    await loginAsAdmin(page);
    await ensureNoOverride(page, OVERRIDE_KEY);

    // Switch identity on the SAME page: the admin session still holds a token
    // in sessionStorage (so the app never redirects to Keycloak → loginAsMember
    // hangs at waitForURL(/realms/)) and Keycloak's SSO cookie would silently
    // re-authenticate the admin. Clear both, exactly like
    // plugin-system/ac-02-authorization.spec.ts does before switching users.
    await page.evaluate(() => sessionStorage.clear());
    await page.context().clearCookies();
    await loginAsMember(page);
    // Direct API calls need the session's freshly minted bearer (the `page`
    // context holds tokens in sessionStorage, not in request headers) — a
    // headerless call answers 401, never the boundary under test.
    const read = await page.request.get(tenantApiUrl(ADMIN_TENANT_SLUG, TRANSLATIONS_PATH), {
      headers: await freshBearer(page),
    });
    expect(read.status()).toBe(200);

    const write = await page.request.put(
      tenantApiUrl(ADMIN_TENANT_SLUG, `${TRANSLATIONS_PATH}/${OVERRIDE_KEY}`),
      { headers: await freshBearer(page), data: { locale: 'en', value: 'Hacked' } }
    );
    expect(write.status()).toBe(403);
  });

  test('admin override → member sees it; revert restores the default', async ({
    page,
    browser,
  }, testInfo) => {
    await loginAsAdmin(page);
    await ensureNoOverride(page, OVERRIDE_KEY);

    // ── Admin adds the override through the settings UI ──────────────────────
    await page.goto('/settings/translations');
    const keyInput = page.getByLabel(/message key/i);
    await keyInput.fill(OVERRIDE_KEY);
    await page.getByRole('button', { name: /add override/i }).click();

    const row = page.getByTestId(`override-row-${OVERRIDE_KEY}`);
    await expect(row).toBeVisible({ timeout: 10_000 });

    const enValue = row.getByLabel(/value \(english\)/i);
    await enValue.fill('Team Areas');
    // Each row renders TWO locale editors (en+it), both with a Save button —
    // scope to the edited locale to avoid a strict-mode multi-match.
    await row
      .getByTestId('override-value-en')
      .getByRole('button', { name: /^save$/i })
      .click();
    await expect(page.getByTestId('translations-feedback')).toHaveText(/override saved/i);

    // ── Regular member session (fresh context, fresh TanStack cache) ─────────
    const member = await openMemberSession(browser, testInfo);
    try {
      // Boot merge fetched the overrides → the sidebar label is overridden.
      // Role-scoped: nav labels render twice in the DOM (desktop aside + hidden
      // mobile drawer); getByRole sees only the visible sidebar link.
      await expect(
        member.page.getByRole('link', { name: 'Team Areas', exact: true }),
        'member must see the tenant override'
      ).toBeVisible({ timeout: 15_000 });
      await expect(member.page.getByRole('link', { name: 'Workspaces', exact: true })).toBeHidden();

      // ── Admin reverts; a fresh member load restores the default ─────────────
      await page.goto('/settings/translations');
      const revertRow = page.getByTestId(`override-row-${OVERRIDE_KEY}`);
      await revertRow.getByRole('button', { name: /revert/i }).click();
      await expect(page.getByTestId('translations-feedback')).toHaveText(/override reverted/i);

      await member.page.reload();
      await expect(
        member.page.getByRole('link', { name: 'Workspaces', exact: true }),
        'revert must restore the default string'
      ).toBeVisible({ timeout: 15_000 });
      await expect(member.page.getByRole('link', { name: 'Team Areas', exact: true })).toBeHidden();
    } finally {
      await member.close();
    }
  });
});
