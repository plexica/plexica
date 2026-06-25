// user-management.spec.ts
// E2E-05: User list and management (Spec 003, Phase 20.5).
// Tests navigate to /users, search/filter, remove user with TypeToConfirmDialog,
// and type-to-confirm interaction. Skips when Keycloak credentials are absent.

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
      // i18n: users.title = 'Users'
      await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
      const main = page.locator('main');
      // Page now renders a <table> or the empty state "No users yet"
      // i18n: users.list.empty = 'No users yet'
      await expect(
        main.getByRole('table').or(main.getByText(/no users yet/i))
      ).toBeVisible({ timeout: 8_000 });
    });

    test('search/filter users by name returns matching results', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      // i18n: common.search = 'Search' — scoped to main to avoid the header search
      const searchInput = main.getByRole('searchbox');
      await searchInput.fill(MEMBER_USERNAME.split('@')[0] ?? MEMBER_USERNAME);
      await page.waitForTimeout(500);
      // The searched user should appear in a table row
      await expect(main.getByText(MEMBER_USERNAME)).toBeVisible({ timeout: 8_000 });
    });

    test('search with no match shows empty state', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      const searchInput = main.getByRole('searchbox');
      await searchInput.fill('no-such-user-xyz-9999');
      await page.waitForTimeout(500);
      // i18n: users.list.empty = 'No users yet'
      await expect(main.getByText(/no users yet/i)).toBeVisible({ timeout: 8_000 });
    });

    test('remove user — TypeToConfirmDialog appears with disabled confirm button', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      // Wait for the table to load with user rows
      await expect(main.getByRole('table')).toBeVisible({ timeout: 8_000 });
      // Find the row containing the member email and click its Delete button
      // i18n: common.delete = 'Delete'
      const userRow = main.getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') });
      await userRow.getByRole('button', { name: /delete/i }).click();
      // TypeToConfirmDialog must appear
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      // Confirm button must be DISABLED until the correct word is typed
      // i18n: common.delete = 'Delete' (confirm button label)
      const confirmBtn = dialog.getByRole('button', { name: /delete/i });
      await expect(confirmBtn).toBeDisabled();
    });

    test('remove user — typing wrong text keeps confirm button disabled', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      await expect(main.getByRole('table')).toBeVisible({ timeout: 8_000 });
      const userRow = main.getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') });
      await userRow.getByRole('button', { name: /delete/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      // Type partial text — button must stay disabled
      // i18n: users.remove.confirm.instructions → 'Type CONFIRM to permanently remove this user'
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
      await userRow.getByRole('button', { name: /delete/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      const confirmInput = dialog.getByLabel(/type confirm/i);
      await confirmInput.fill('CONFIRM');
      // After typing the exact word, the confirm button must be enabled
      const confirmBtn = dialog.getByRole('button', { name: /delete/i });
      await expect(confirmBtn).toBeEnabled({ timeout: 2_000 });
    });

    test('remove user — cancel dismisses dialog and resets typed text', async ({ page }) => {
      await page.goto('/users');
      const main = page.locator('main');
      await expect(main.getByRole('table')).toBeVisible({ timeout: 8_000 });
      const userRow = main.getByRole('row', { name: new RegExp(MEMBER_USERNAME, 'i') });
      await userRow.getByRole('button', { name: /delete/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      // Type something before cancelling
      const confirmInput = dialog.getByLabel(/type confirm/i);
      await confirmInput.fill('CONFIRM');
      // Cancel — we do not actually remove the shared member user in E2E
      await dialog.getByRole('button', { name: /cancel/i }).first().click();
      await expect(dialog).not.toBeVisible({ timeout: 3_000 });
      // Reopen: the typed text must be reset (dialog state cleared on close)
      await userRow.getByRole('button', { name: /delete/i }).click();
      const dialog2 = page.getByRole('dialog');
      await expect(dialog2).toBeVisible({ timeout: 5_000 });
      const confirmInput2 = dialog2.getByLabel(/type confirm/i);
      await expect(confirmInput2).toHaveValue('');
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
    await expect(
      page
        .getByText(/error occurred|forbidden|403|not allowed|no users yet|failed to load/i)
        .or(page.getByRole('heading', { name: /dashboard/i }))
    ).toBeVisible({ timeout: 8_000 });
  });
});
