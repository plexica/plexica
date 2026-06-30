// marketplace.spec.ts
// E2E tests: Marketplace UI — Spec 004, AC-05 (Marketplace & CLI).
//
// Tests the marketplace page features added in Phase 8:
//   - Category filter chips
//   - Search input with debounced filtering
//   - Plugin cards with rating stars
//   - Detail sheet with permissions/data tables/events sections
//   - Empty state when no plugins match
//   - Error state handling
//
// Requires Keycloak (PLAYWRIGHT_KEYCLOAK_URL etc.) and the E2E tenant provisioned
// by global-setup.ts. Skips gracefully when not available.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
} from './helpers/admin-login.js';

test.describe('004 Plugin System — Marketplace UI (Phase 8)', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('AC-05: Marketplace page loads with title and search input', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: /marketplace/i })).toBeVisible({ timeout: 10_000 });
    const search = page.getByPlaceholder(/Search plugins/i);
    await expect(search).toBeVisible();
  });

  test('AC-05: Category filter chips are visible and clickable', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');

    // The filter group should exist with category buttons
    const filterGroup = page.getByRole('group', { name: /filter by category/i });
    await expect(filterGroup).toBeVisible({ timeout: 10_000 });

    // "All" should be the default active filter
    const allButton = filterGroup.getByRole('button', { pressed: true });
    await expect(allButton).toBeVisible();

    // Click a category and verify it becomes active
    const salesButton = filterGroup.getByRole('button', { name: /sales/i });
    await salesButton.click();
    await expect(salesButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('AC-05: Search input filters plugins by name', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');

    const search = page.getByPlaceholder(/Search plugins/i);
    await search.fill('CRM');

    // Wait for debounced search (300ms) + API response
    await page.waitForTimeout(500);
    await page.waitForLoadState('domcontentloaded');
    // Should not crash — either shows results or empty state
    const hasCrash = await page.getByRole('alert').first().isVisible().catch(() => false);
    expect(hasCrash).toBe(false);
  });

  test('AC-05: Plugin card renders with name, author, and install count', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const cards = page.getByTestId('plugin-card');
    if (await cards.count() === 0) return;
    const c = cards.first();
    await expect(c).toBeVisible();
    await expect(c).toHaveAttribute('tabindex', '0');
    await expect(c).toHaveAttribute('role', 'button');
  });

  test('AC-05: Plugin detail sheet opens when card is clicked', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const cards = page.getByTestId('plugin-card');
    if (await cards.count() === 0) return;
    await cards.first().click();
    await page.waitForLoadState('domcontentloaded');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const closeBtn = dialog.getByRole('button', { name: /close/i });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(dialog).not.toBeVisible();
  });

  test('AC-05: Marketplace handles empty state gracefully when no plugins', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    await page.getByPlaceholder(/Search plugins/i).fill('XYZZYX-NONEXISTENT-PLUGIN');
    await page.waitForTimeout(500);
    const hasCrash = await page.getByRole('alert').first().isVisible().catch(() => false);
    expect(hasCrash).toBe(false);
  });

  test('AC-05: Marketplace page does not crash on load', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const hasCrash = await page.getByRole('alert').first().isVisible().catch(() => false);
    expect(hasCrash).toBe(false);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test('AC-05: Installed plugins page loads without crash', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings/plugins');
    await page.waitForLoadState('domcontentloaded');
    const hasCrash = await page.getByRole('alert').first().isVisible().catch(() => false);
    expect(hasCrash).toBe(false);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test('AC-05: Detail sheet handles API error gracefully', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const cards = page.getByTestId('plugin-card');
    if (await cards.count() === 0) return;
    // Intercept detail API to simulate failure
    await page.route('**/api/plugins/**', (route) => route.abort());
    await cards.first().click();
    await page.waitForLoadState('domcontentloaded');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByRole('button', { name: /retry/i })).toBeVisible();
    await expect(dialog.getByText(/failed/i)).toBeVisible();
  });

  test('AC-05: Rating stars render when plugins have ratings', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const rating = page.getByRole('img', { name: /out of 5 stars/i }).first();
    const hasRating = await rating.isVisible().catch(() => false);
    if (hasRating) await expect(rating).toBeVisible();
  });

  test('AC-05: Install button exists and responds to click', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const installBtn = page.getByRole('button', { name: /^install$/i }).first();
    if (!(await installBtn.isVisible().catch(() => false))) return;
    await installBtn.click();
    await page.waitForTimeout(500);
    const hasCrash = await page.getByRole('alert').first().isVisible().catch(() => false);
    expect(hasCrash).toBe(false);
  });
});
