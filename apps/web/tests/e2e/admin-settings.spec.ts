/**
 * Tenant Admin — Settings E2E Tests (T008-62)
 *
 * Covers:
 *   - Settings page renders with heading
 *   - Branding section is visible with colour inputs
 *   - Preferences section is visible with locale/timezone/date format
 *   - "Save branding" button saves and shows toast
 *   - "Save preferences" button saves and shows toast
 *
 * Spec 008 Admin Interfaces — Phase 8: Frontend Tests
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

test.describe('Tenant Admin — Settings', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Tenant Settings', level: 1 })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display the Settings page heading and description', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Tenant Settings', level: 1 })).toBeVisible();
    await expect(
      page.getByText("Customize your tenant's appearance and preferences.")
    ).toBeVisible();
  });

  test('should display the Branding section', async ({ page }) => {
    await expect(page.getByText('Branding')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Primary colour hex value')).toBeVisible();
    await expect(page.getByLabel('Accent colour hex value')).toBeVisible();
    await expect(page.getByLabel('Logo URL')).toBeVisible();
  });

  test('should pre-populate primary colour from loaded settings', async ({ page }) => {
    const input = page.getByLabel('Primary colour hex value');
    await expect(input).toHaveValue('#6366f1', { timeout: 10000 });
  });

  test('should pre-populate accent colour from loaded settings', async ({ page }) => {
    const input = page.getByLabel('Accent colour hex value');
    await expect(input).toHaveValue('#8b5cf6', { timeout: 10000 });
  });

  test('should display the Preferences section', async ({ page }) => {
    await expect(page.getByText('Preferences')).toBeVisible({ timeout: 10000 });
  });

  test('should display Save branding button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Save branding' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should display Save preferences button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Save preferences' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should save branding settings and show success toast', async ({ page }) => {
    // Update primary colour
    await page.getByLabel('Primary colour hex value').fill('#ff0000');
    await page.getByRole('button', { name: 'Save branding' }).click();
    // Sonner toast should appear
    const toast = page.locator('[data-sonner-toast]', { hasText: 'Settings saved' });
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('should save preferences settings and show success toast', async ({ page }) => {
    await page.getByRole('button', { name: 'Save preferences' }).click();
    const toast = page.locator('[data-sonner-toast]', { hasText: 'Settings saved' });
    await expect(toast).toBeVisible({ timeout: 5000 });
  });
});
