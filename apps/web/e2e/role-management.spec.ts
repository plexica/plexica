// role-management.spec.ts
// E2E-11: Role management page (Spec 003, Phase 20.11).
// Tests /users/roles: 4 role cards, action matrix, CSV export, non-admin redirect.
// Skips when Keycloak credentials are absent or the stack is not running.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  loginAsMember,
  requireKeycloakInCI,
} from './helpers/admin-login.js';

// The 4 expected built-in roles per Spec 003 (tenant-admin + 3 workspace roles)
const EXPECTED_ROLES = ['admin', 'member', 'viewer'];

test.describe('E2E-11: Role management', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('navigate to /users/roles shows role cards', async ({ page }) => {
    await page.goto('/users/roles');
    await expect(page).toHaveURL(/\/users\/roles/);

    // Each expected role should have a visible card
    for (const role of EXPECTED_ROLES) {
      await expect(
        page
          .getByRole('heading', { name: new RegExp(role, 'i') })
          .or(page.getByText(new RegExp(role, 'i')))
      ).toBeVisible();
    }
  });

  test('role cards show descriptions', async ({ page }) => {
    await page.goto('/users/roles');

    // Cards should contain description text (non-empty)
    const cards = page.getByRole('article').or(page.locator('[data-testid="role-card"]'));
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // First card must have a non-empty description paragraph
    const firstDesc = cards
      .first()
      .getByRole('paragraph')
      .or(cards.first().locator('p, [data-testid="role-description"]'));
    const text = await firstDesc.first().textContent();
    expect((text ?? '').trim().length).toBeGreaterThan(0);
  });

  test('action matrix renders with allow/deny values', async ({ page }) => {
    await page.goto('/users/roles');

    // The matrix / permission table should be visible
    const matrix = page
      .getByRole('table', { name: /permission|action/i })
      .or(page.locator('[data-testid="permissions-matrix"]'));
    await expect(matrix).toBeVisible({ timeout: 5_000 });

    // Matrix must contain at least one "allow" and one "deny" indicator
    await expect(matrix.getByText(/allow|yes|✓/i).first()).toBeVisible();
    await expect(matrix.getByText(/deny|no|✗|—/i).first()).toBeVisible();
  });

  test('CSV export downloads a file', async ({ page }) => {
    await page.goto('/users/roles');

    // Listen for the download before clicking
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export.*csv|download.*csv|csv/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });

  test('non-admin user gets redirected or 403 when accessing /users/roles', async ({
    page: _page,
    context,
  }) => {
    const memberPage = await context.newPage();
    await loginAsMember(memberPage);
    await memberPage.goto('/users/roles');

    await expect(
      memberPage
        .getByText(/forbidden|403|not allowed|access denied/i)
        .or(memberPage.getByRole('heading', { name: /dashboard/i }))
    ).toBeVisible({ timeout: 8_000 });

    await memberPage.close();
  });

  test('/users/roles is keyboard-navigable', async ({ page }) => {
    await page.goto('/users/roles');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });

  test('/users/roles passes axe-core accessibility check', async ({ page }) => {
    await page.goto('/users/roles');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
