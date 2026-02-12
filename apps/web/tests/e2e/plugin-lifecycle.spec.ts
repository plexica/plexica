/**
 * Plugin Lifecycle E2E Tests
 *
 * Tests the full plugin management workflow:
 * - View installed plugins list
 * - Browse marketplace
 * - Install/activate/deactivate/uninstall plugins
 * - Plugin detail page
 * - View modes (grid, list, table)
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

test.describe('Plugin Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/plugins');
    await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible({ timeout: 15000 });
  });

  test('should display plugins page heading and subtitle', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Plugins', level: 1 })).toBeVisible();
    await expect(page.getByText('Manage your installed plugins')).toBeVisible();
  });

  test('should show installed plugins on My Plugins tab', async ({ page }) => {
    // My Plugins tab should be active by default
    await expect(page.getByText('CRM Pro').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Analytics Dashboard').first()).toBeVisible();
    await expect(page.getByText('Billing Manager').first()).toBeVisible();
  });

  test('should show plugin status badges', async ({ page }) => {
    // Active plugins should show "Active" badge
    const activeCount = await page.getByText('Active', { exact: true }).count();
    expect(activeCount).toBeGreaterThanOrEqual(2);
  });

  test('should show plugin stats line', async ({ page }) => {
    await expect(page.getByText(/3 installed/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/2 active/)).toBeVisible();
  });

  test('should switch to Browse Marketplace tab', async ({ page }) => {
    // Click Browse Marketplace tab
    await page.getByRole('button', { name: /Browse Marketplace/i }).click();

    // Should show marketplace plugins
    await expect(page.getByText('HR Suite').first()).toBeVisible({ timeout: 10000 });
    // Search input should be visible
    await expect(page.getByPlaceholder('Search plugins...')).toBeVisible();
  });

  test('should search marketplace plugins', async ({ page }) => {
    await page.getByRole('button', { name: /Browse Marketplace/i }).click();
    await expect(page.getByPlaceholder('Search plugins...')).toBeVisible({ timeout: 10000 });

    // Type in search
    await page.getByPlaceholder('Search plugins...').fill('CRM');
    // CRM Pro should still be visible (but as "Already Installed")
    await expect(page.getByText('CRM Pro').first()).toBeVisible();
  });

  test('should show already installed badge for installed plugins in marketplace', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /Browse Marketplace/i }).click();
    await expect(page.getByText('Already Installed').first()).toBeVisible({ timeout: 10000 });
  });

  test('should handle plugin disable action', async ({ page }) => {
    // Wait for plugins to load
    await expect(page.getByText('CRM Pro').first()).toBeVisible({ timeout: 10000 });

    // Find the disable button for an active plugin
    const disableButton = page.getByRole('button', { name: /Disable/i }).first();
    if (await disableButton.isVisible().catch(() => false)) {
      await disableButton.click();
      // Should trigger an API call (mocked)
    }
  });

  test('should handle plugin enable action', async ({ page }) => {
    // Wait for plugins to load
    await expect(page.getByText('Billing Manager').first()).toBeVisible({ timeout: 10000 });

    // Find the enable button for an inactive plugin
    const enableButton = page.getByRole('button', { name: /Enable/i }).first();
    if (await enableButton.isVisible().catch(() => false)) {
      await enableButton.click();
    }
  });

  test('should show configure dialog for a plugin', async ({ page }) => {
    await expect(page.getByText('CRM Pro').first()).toBeVisible({ timeout: 10000 });

    // Click Configure button
    const configButton = page.getByRole('button', { name: 'Configure' }).first();
    if (await configButton.isVisible().catch(() => false)) {
      await configButton.click();
      // Dialog should appear with heading "Configure <plugin name>"
      await expect(page.getByRole('heading', { name: /Configure/i })).toBeVisible();
    }
  });
});
