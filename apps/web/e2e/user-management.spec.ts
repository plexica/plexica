// user-management.spec.ts
// E2E-05: User list and management (Spec 003, Phase 20.5).
// Tests navigate to /users, search/filter, remove user with TypeToConfirmDialog,
// and type-to-confirm interaction. Skips when Keycloak credentials are absent.
//
// SCOPE — the "remove user" tests below cover the TypeToConfirmDialog WIDGET
// only (disabled/enabled/cancel states); none of them completes the removal, so
// none of them issues the DELETE. The destructive flow itself — DELETE round
// trip, disappearance from GET /api/v1/users and revocation of the removed
// user's access — lives in user-removal.spec.ts. Keep it that way: a completed
// removal is irreversible and must use a dedicated disposable user, never
// MEMBER_USERNAME, which the rest of the suite depends on.

import { expect, test } from './helpers/base-fixture.js';
import { expectApiStatus } from './helpers/api-response.js';
import {
  ADMIN_TENANT_SLUG,
  hasKeycloak,
  loginAsAdmin,
  loginAsMember,
  MEMBER_USERNAME,
  requireKeycloakInCI,
} from './helpers/admin-login.js';
import { freshBearer } from './helpers/session-token.js';
import { tenantApiUrl } from './helpers/tenant-hosts.js';

test.describe('E2E-05: User management', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  // MEMBER_USERNAME must have a tenant user_profile row before any test reads
  // GET /api/v1/users. The row is created lazily by userProfileResolver on the
  // member's FIRST authenticated request — it does NOT come from global-setup
  // (which only creates the Keycloak account). Running this file in isolation
  // previously relied on rbac-permissions.spec.ts having logged the member in
  // first, which is an ordering dependency the test must not have.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await loginAsMember(page);
      // An authenticated tenant request is what provisions user_profile.
      // Assert the 200 fail-fast: a silent 401/500 here means the profile was
      // never provisioned and every test below fails downstream with the
      // misleading "member not found in /users". The URL goes through
      // tenantApiUrl so the host always matches the tenant the member logged
      // into — API_BASE only worked by coincidence (slug == DNS first label).
      const res = await page.request.get(tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/profile'), {
        headers: await freshBearer(page),
      });
      await expectApiStatus(res, 200);
    } finally {
      await page.close();
    }
  });

  test.describe('admin tests', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('navigate to /users shows user list', async ({ page }) => {
      await page.goto('/users');
      await expect(page).toHaveURL(/\/users/);
      // i18n: users.title = 'Users'
      await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
      const main = page.locator('main');
      // Page renders a <table> or the empty state "No users yet"
      await expect(
        main.getByRole('table').or(main.getByText(/no users yet/i))
      ).toBeVisible({ timeout: 8_000 });
    });

    test('search/filter users by name returns matching results', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      const searchInput = main.getByRole('searchbox');
      const searchName = MEMBER_USERNAME.split('@')[0] ?? MEMBER_USERNAME;
      await searchInput.fill(searchName);
      // Deterministic: wait for the member to appear, not a fixed timeout
      // Mobile <p> is sm:hidden (invisible on desktop). Target the table cell instead.
      await expect(main.getByRole('cell', { name: MEMBER_USERNAME })).toBeVisible({ timeout: 8_000 });
    });

    test('search with no match shows empty state', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      const searchInput = main.getByRole('searchbox');
      await searchInput.fill('no-such-user-xyz-9999');
      // Deterministic: wait for the empty state text to appear
      // i18n: users.list.empty = 'No users yet'
      await expect(main.getByText(/no users yet/i)).toBeVisible({ timeout: 8_000 });
    });

    test('remove user — TypeToConfirmDialog appears with disabled confirm button', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      await expect(main.getByRole('table')).toBeVisible({ timeout: 8_000 });
      const userRow = main.getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') });
      await userRow.getByRole('button', { name: /^remove /i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      // Confirm button must be DISABLED until the correct word is typed
      const confirmBtn = dialog.getByRole('button', { name: /delete/i });
      await expect(confirmBtn).toBeDisabled();
    });

    test('remove user — typing wrong text keeps confirm button disabled', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      await expect(main.getByRole('table')).toBeVisible({ timeout: 8_000 });
      const userRow = main.getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') });
      await userRow.getByRole('button', { name: /^remove /i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      const confirmInput = dialog.getByLabel(/type confirm/i);
      await confirmInput.fill('CONFIR');
      const confirmBtn = dialog.getByRole('button', { name: /delete/i });
      await expect(confirmBtn).toBeDisabled();
    });

    test('remove user — typing CONFIRM enables the confirm button', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      await expect(main.getByRole('table')).toBeVisible({ timeout: 8_000 });
      const userRow = main.getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') });
      await userRow.getByRole('button', { name: /^remove /i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      const confirmInput = dialog.getByLabel(/type confirm/i);
      await confirmInput.fill('CONFIRM');
      const confirmBtn = dialog.getByRole('button', { name: /delete/i });
      await expect(confirmBtn).toBeEnabled({ timeout: 2_000 });
    });

    test('remove user — cancel dismisses dialog and resets typed text', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      await expect(main.getByRole('table')).toBeVisible({ timeout: 8_000 });
      const userRow = main.getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') });
      await userRow.getByRole('button', { name: /^remove /i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      const confirmInput = dialog.getByLabel(/type confirm/i);
      await confirmInput.fill('CONFIRM');
      await dialog.getByRole('button', { name: /cancel/i }).first().click();
      await expect(dialog).not.toBeVisible({ timeout: 3_000 });
      // Reopen: typed text must be reset
      await userRow.getByRole('button', { name: /^remove /i }).click();
      const dialog2 = page.getByRole('dialog');
      await expect(dialog2).toBeVisible({ timeout: 5_000 });
      await expect(dialog2.getByLabel(/type confirm/i)).toHaveValue('');
    });

    test('/users page is keyboard-navigable', async ({ page }) => {
      await page.goto('/users');
      await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
      expect(focused).not.toBe('BODY');
    });
  });

  test('non-admin is redirected away from /users', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/users');
    // A non-admin must NOT see the users list — assert a deterministic blocked outcome.
    // Either redirected to dashboard, or shown a forbidden/error message.
    // PageError wraps the error in role="alert" — use that to avoid strict mode
    // (both "Failed to load" and "Something went wrong" match the same regex).
    await expect(
      page.getByRole('alert').or(page.getByRole('heading', { name: /dashboard/i }))
    ).toBeVisible({ timeout: 8_000 });
  });
});
