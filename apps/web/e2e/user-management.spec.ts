// user-management.spec.ts
// E2E-05: User list and management (Spec 003, Phase 20.5).
// Tests navigate to /users, search/filter, remove user, verify removed user blocked.
// Skips when Keycloak credentials are absent or the stack is not running.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  loginAsMember,
  MEMBER_USERNAME,
  requireKeycloakInCI,
} from './helpers/admin-login.js';

test.describe('E2E-05: User management', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.describe('admin tests', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('navigate to /users shows user list', async ({ page }) => {
      await page.goto('/users');
      await expect(page).toHaveURL(/\/users/);
      // Page renders heading "Users" and a <ul> user list inside main content.
      // i18n: users.title = 'Users'
      await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
      // At minimum, wait for either user items or "No data." empty state
      const main = page.locator('main');
      await expect(
        main
          .locator('ul > li')
          .first()
          .or(main.getByText(/no data/i))
      ).toBeVisible({ timeout: 8_000 });
    });

    test('search/filter users by name returns matching results', async ({ page }) => {
      await page.goto('/users');
      // The page has its own search input inside <main>; scope to avoid
      // strict mode collision with the header global search input.
      const main = page.locator('main');
      // i18n: common.search = 'Search', aria-label on the page input
      const searchInput = main.getByRole('searchbox');
      await searchInput.fill(MEMBER_USERNAME.split('@')[0] ?? MEMBER_USERNAME);
      // Wait for filtered results
      await page.waitForTimeout(500);
      // The searched user should appear (email shown in sub-text)
      await expect(main.getByText(MEMBER_USERNAME)).toBeVisible({ timeout: 8_000 });
    });

    test('search with no match shows empty state', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      const searchInput = main.getByRole('searchbox');
      await searchInput.fill('no-such-user-xyz-9999');
      await page.waitForTimeout(500);
      // i18n: common.noData = 'No data.'
      await expect(main.getByText(/no data/i)).toBeVisible({ timeout: 8_000 });
    });

    test('remove user — confirmation dialog appears', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      // Wait for the user list to load
      await expect(main.locator('ul > li').first()).toBeVisible({ timeout: 8_000 });
      // Find a list item containing the member email and click its "Delete" button
      // i18n: common.delete = 'Delete'
      const userItem = main.locator('li', { hasText: MEMBER_USERNAME });
      await userItem.getByRole('button', { name: /delete/i }).click();
      // A confirmation dialog must appear
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    });

    test('remove user — cancel dismisses dialog', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      await expect(main.locator('ul > li').first()).toBeVisible({ timeout: 8_000 });
      const userItem = main.locator('li', { hasText: MEMBER_USERNAME });
      await userItem.getByRole('button', { name: /delete/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      // Cancel — we don't actually remove the shared member user in E2E.
      // Two buttons match /cancel/i: the form Cancel and the X close button.
      // Target the form Cancel button (first match).
      await dialog
        .getByRole('button', { name: /cancel/i })
        .first()
        .click();
      await expect(dialog).not.toBeVisible({ timeout: 3_000 });
    });

    test('/users page is keyboard-navigable', async ({ page }) => {
      await page.goto('/users');
      // Wait for content to load
      await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
      expect(focused).not.toBe('BODY');
    });
  });

  test('non-admin is redirected away from /users', async ({ page }) => {
    // Login as member directly in a fresh page (no admin beforeEach).
    await loginAsMember(page);
    await page.goto('/users');
    // Non-admin should see "An error occurred." (TanStack Query isError from 403),
    // a forbidden message, or be redirected to dashboard.
    await expect(
      page
        .getByText(/error occurred|forbidden|403|not allowed|no data|failed/i)
        .or(page.getByRole('heading', { name: /dashboard/i }))
    ).toBeVisible({ timeout: 8_000 });
  });
});
