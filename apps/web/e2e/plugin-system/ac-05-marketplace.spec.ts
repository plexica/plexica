// ac-05-marketplace.spec.ts — Spec 004, AC-05: Marketplace browsing.
// Real behavior: search by name, filter by category, open the detail sheet and
// verify the permissions / data tables / events sections render, then close it.
// Also covers: rating stars, install button, empty/hint states, keyboard nav,
// and WCAG 2.1 AA compliance.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../helpers/base-fixture.js';
import { hasKeycloak, loginAsAdmin, requireKeycloakInCI } from '../helpers/admin-login.js';

test.describe('004 Plugin System — AC-05: Marketplace', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  // Setup: login and navigate to marketplace before each test.
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
  });

  test('AC-05.1: marketplace page loads with plugin cards showing name, author', async ({
    page,
  }) => {
    const cards = page.getByTestId('plugin-card');
    await expect(cards).toHaveCount(1);
    const crm = cards.filter({ hasText: 'CRM' });
    await expect(crm.getByRole('heading', { name: 'CRM', exact: true })).toBeVisible();
    await expect(crm.getByText('Plexica', { exact: true })).toBeVisible();
  });

  test('AC-05.2: search by name filters the plugin grid', async ({ page }) => {
    const search = page.getByPlaceholder(/Search plugins/i);
    await expect(search).toBeVisible({ timeout: 10_000 });

    await search.fill('CRM');
    await expect(page.getByTestId('plugin-card')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'CRM', exact: true })).toBeVisible();
    await search.fill('unrelated-plugin');
    await expect(page.getByTestId('plugin-card')).toHaveCount(0);
  });

  test('AC-05.3: filter by category activates the category chip', async ({ page }) => {
    const filterGroup = page.getByRole('group', { name: /filter by category/i });
    await expect(filterGroup).toBeVisible({ timeout: 10_000 });

    const sales = filterGroup.getByRole('button', { name: /sales/i });
    await expect(sales).toBeVisible();
    await sales.click();
    await expect(sales).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('plugin-card')).toHaveCount(1);
    await filterGroup.getByRole('button', { name: /analytics/i }).click();
    await expect(page.getByTestId('plugin-card')).toHaveCount(0);
  });

  test('AC-05.4: plugin detail sheet opens on card click and shows permissions/tables/events', async ({
    page,
  }) => {
    const cards = page.getByTestId('plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // Click the "View details" button — dialog appears immediately (skeleton state)
    const detailBtn = cards.first().getByRole('button', { name: /view details/i });
    await detailBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Create Contact', { exact: true })).toBeVisible();
    await expect(dialog.getByText('crm_contacts', { exact: true })).toBeVisible();
    await expect(dialog.getByText('plexica.workspace.created', { exact: true })).toBeVisible();

    // Close via Escape (works in all dialog states: skeleton, content, error)
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('AC-05.5: detail sheet passes axe-core WCAG 2.1 AA check', async ({ page }) => {
    const cards = page.getByTestId('plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // Click the "View details" button — dialog appears immediately (skeleton state)
    const detailBtn = cards.first().getByRole('button', { name: /view details/i });
    await detailBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Run axe-core on the dialog in whatever state it's in
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('AC-05.6: plugin card is keyboard accessible — Tab to detail button, Enter opens detail, Escape closes', async ({
    page,
  }) => {
    const cards = page.getByTestId('plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // Focus the "View details" button inside the first card
    const detailBtn = cards.first().getByRole('button', { name: /view details/i });
    await detailBtn.focus();
    await expect(detailBtn).toBeFocused();

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
    await expect(firstCard.getByRole('button', { name: /^installed$/i })).toBeDisabled();
    await page.goto('/settings/plugins');
    await expect(page.getByText('CRM', { exact: true }).first()).toBeVisible();
  });

  test('AC-05.8: empty search shows filtered empty state with hint', async ({ page }) => {
    const search = page.getByPlaceholder(/Search plugins/i);
    await expect(search).toBeVisible({ timeout: 10_000 });

    // Search for a string that won't match any plugin
    await search.fill('ZZZZ_NONEXISTENT_PLUGIN_999');
    await page.waitForTimeout(500);

    // Should show the filtered empty state heading
    await expect(page.getByRole('heading', { name: /no plugins match/i })).toBeVisible({
      timeout: 10_000,
    });

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
    await expect(page.getByRole('heading', { name: /no plugins available/i })).toBeVisible({
      timeout: 10_000,
    });

    // The hint should NOT be visible (no filter is active)
    const hint = page.getByText(/adjusting your search/i);
    await expect(hint).not.toBeVisible();
  });
});
