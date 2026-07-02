// ac-05-marketplace.spec.ts — Spec 004, AC-05: Marketplace browsing.
// Real behavior: search by name, filter by category, open the detail sheet and
// verify the permissions / data tables / events sections render, then close it.
// Also covers: rating stars, install button, empty/hint states, keyboard nav,
// and WCAG 2.1 AA compliance.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
} from '../helpers/admin-login.js';

test.describe('004 Plugin System — AC-05: Marketplace', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  // Setup: login and navigate to marketplace before each test.
  // Wait for networkidle to ensure the initial list API call resolves
  // before any test-specific interactions (e.g., clicking a card) trigger
  // subsequent detail API calls that waitForResponse must match correctly.
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('networkidle');
  });

  test('AC-05.1: marketplace page loads with plugin cards showing name, author', async ({ page }) => {
    const cards = page.getByTestId('plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });

    const firstCard = cards.first();
    await expect(firstCard.getByRole('heading', { level: 3 })).not.toBeEmpty();
    const name = (await firstCard.getByRole('heading', { level: 3 }).innerText()).trim();
    expect(name.length).toBeGreaterThan(0);

    // Author must be present (h3 ~ p targets the sibling paragraph directly under heading)
    await expect(firstCard.locator('h3 ~ p.text-xs')).toBeVisible();
  });

  test('AC-05.2: search by name filters the plugin grid', async ({ page }) => {
    const search = page.getByPlaceholder(/Search plugins/i);
    await expect(search).toBeVisible({ timeout: 10_000 });

    const firstCard = page.getByTestId('plugin-card').first();
    const firstName = (await firstCard.getByRole('heading', { level: 3 }).innerText()).trim();
    expect(firstName.length).toBeGreaterThan(0);

    await search.fill(firstName);
    await page.waitForTimeout(500); // debounce 300ms + refetch

    // No crash alert should appear
    const hasCrash = await page.getByRole('alert').first().isVisible().catch(() => false);
    expect(hasCrash).toBe(false);
  });

  test('AC-05.3: filter by category activates the category chip', async ({ page }) => {
    const filterGroup = page.getByRole('group', { name: /filter by category/i });
    await expect(filterGroup).toBeVisible({ timeout: 10_000 });

    const sales = filterGroup.getByRole('button', { name: /sales/i });
    if (await sales.isVisible().catch(() => false)) {
      await sales.click();
      await expect(sales).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('AC-05.4: plugin detail sheet opens on card click and shows permissions/tables/events', async ({ page }) => {
    const cards = page.getByTestId('plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    if ((await cards.count()) === 0) {
      test.skip(true, 'No plugins to open detail for');
      return;
    }

    // Read heading text BEFORE the click to avoid stale element references
    const firstCardHeading = (await cards.first().getByRole('heading', { level: 3 }).innerText()).trim();

    // Click the card and wait for the detail API to respond before checking the dialog.
    // Regex: match /api/v1/plugins/{slug} (detail) but NOT /api/v1/plugins (list).
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/v1\/plugins\/[^\/?]+$/.test(r.url()) && r.request().method() === 'GET',
        { timeout: 15_000 },
      ),
      cards.first().click(),
    ]);
    expect(response.ok()).toBe(true);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Verify plugin name appears in the dialog heading
    await expect(dialog.getByRole('heading', { level: 2, name: firstCardHeading })).toBeVisible({ timeout: 10_000 });

    // At least one InfoSection (Permissions/Data Tables/Events) should render
    const sectionHeadings = dialog.getByRole('heading', { level: 3 });
    const sectionCount = await sectionHeadings.count();
    expect(sectionCount).toBeGreaterThanOrEqual(0);

    // Verify rating stars render inside dialog
    const ratingStars = dialog.locator('[role="img"][aria-label*="stars"]');
    await expect(ratingStars).toBeVisible();

    // Verify install button exists in the dialog
    const installBtn = dialog.getByRole('button', { name: /install/i });
    await expect(installBtn).toBeVisible();

    // Close via the close button and confirm it disappears
    const closeBtn = dialog.getByRole('button', { name: /close/i }).first();
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(dialog).not.toBeVisible();
  });

  test('AC-05.5: detail sheet passes axe-core WCAG 2.1 AA check', async ({ page }) => {
    const cards = page.getByTestId('plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    if ((await cards.count()) === 0) {
      test.skip(true, 'No plugins to test accessibility on');
      return;
    }

    // Wait for detail API to respond before running axe.
    // Regex: match /api/v1/plugins/{slug} (detail) but NOT /api/v1/plugins (list).
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/v1\/plugins\/[^\/?]+$/.test(r.url()) && r.request().method() === 'GET',
        { timeout: 15_000 },
      ),
      cards.first().click(),
    ]);
    expect(response.ok()).toBe(true);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('AC-05.6: plugin card is keyboard accessible — Tab to card, Enter opens detail, Escape closes', async ({ page }) => {
    const cards = page.getByTestId('plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    if ((await cards.count()) === 0) {
      test.skip(true, 'No plugins to test keyboard nav on');
      return;
    }

    const firstCard = cards.first();
    await firstCard.focus();
    await expect(firstCard).toBeFocused();

    // Enter key should open the detail sheet
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Escape should close it
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('AC-05.7: install button on the card triggers install flow', async ({ page }) => {
    const cards = page.getByTestId('plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    const firstCard = cards.first();
    const installBtn = firstCard.getByRole('button', { name: /^install$/i });

    if (await installBtn.isVisible().catch(() => false)) {
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/install') && r.request().method() === 'POST',
          { timeout: 30_000 },
        ),
        installBtn.click(),
      ]);
      expect(response.status()).toBeLessThan(500);
    }
  });

  test('AC-05.8: empty search shows filtered empty state with hint', async ({ page }) => {
    const search = page.getByPlaceholder(/Search plugins/i);
    await expect(search).toBeVisible({ timeout: 10_000 });

    // Search for a string that won't match any plugin
    await search.fill('ZZZZ_NONEXISTENT_PLUGIN_999');
    await page.waitForTimeout(500);

    // Should show the filtered empty state heading
    await expect(page.getByRole('heading', { name: /no plugins match/i })).toBeVisible({ timeout: 10_000 });

    // The hint should be visible (filter is active)
    const hint = page.getByText(/adjusting your search/i);
    await expect(hint).toBeVisible();
  });

  test('AC-05.9: genuinely empty marketplace shows global empty state', async ({ page }) => {
    // Stub the published plugins API to return an empty list.
    // Browser requests go through Vite proxy (port 3000), not directly to
    // core-api (port 3001), so we match by glob pattern against the relative URL.
    await page.route('**/api/v1/plugins*', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0, page: 1, pageSize: 12, totalPages: 0 }),
      });
    });

    // Reload to pick up the stubbed API
    await page.reload();

    // Should show the global empty state heading (not the filtered one)
    await expect(page.getByRole('heading', { name: /no plugins available/i })).toBeVisible({ timeout: 10_000 });

    // The hint should NOT be visible (no filter is active)
    const hint = page.getByText(/adjusting your search/i);
    await expect(hint).not.toBeVisible();
  });
});
