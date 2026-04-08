// tenant-settings.spec.ts
// E2E-07: Tenant settings (Spec 003, Phase 20.7).
// Tests display name update, logo upload, primary color, dark mode, MFA toggle.
// Skips when Keycloak credentials are absent or the stack is not running.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';

test.describe('E2E-07: Tenant settings', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('update tenant display name', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);

    const nameInput = page.getByLabel(/display name|organization name|tenant name/i);
    await nameInput.clear();
    const newName = uniqueName('Tenant');
    await nameInput.fill(newName);
    await page.getByRole('button', { name: /save/i }).click();

    await expect(page.getByText(/saved|updated/i)).toBeVisible({ timeout: 8_000 });
  });

  test('upload logo — preview updates on settings page', async ({ page }) => {
    await page.goto('/settings/branding');
    await expect(page).toHaveURL(/\/settings\/branding/);

    // Prepare a minimal 1×1 PNG as a Buffer for upload
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: pngBytes,
    });
    await page.getByRole('button', { name: /save|upload/i }).click();

    // Logo preview should be visible after save
    await expect(page.getByRole('img', { name: /logo|brand/i })).toBeVisible({ timeout: 10_000 });
  });

  test('change primary color — UI updates with new color', async ({ page }) => {
    await page.goto('/settings/branding');

    const colorInput = page.getByLabel(/primary color/i);
    await colorInput.fill('#ff6b35');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/saved|updated/i)).toBeVisible({ timeout: 8_000 });

    // Reload and verify the value persisted
    await page.reload();
    await expect(page.getByLabel(/primary color/i)).toHaveValue(/#ff6b35/i);
  });

  test('toggle dark mode — theme class applied to document', async ({ page }) => {
    await page.goto('/settings');

    const darkModeToggle = page
      .getByRole('switch', { name: /dark mode/i })
      .or(page.getByLabel(/dark mode/i));
    await darkModeToggle.click();

    // Verify dark class applied (common patterns: class="dark" or data-theme="dark")
    const isDark = await page.evaluate(() => {
      const root = document.documentElement;
      return root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark';
    });
    expect(isDark).toBe(true);
  });

  test('update auth config — MFA required toggle', async ({ page }) => {
    await page.goto('/settings/auth');
    await expect(page).toHaveURL(/\/settings\/auth/);

    const mfaToggle = page
      .getByRole('switch', { name: /mfa|multi-factor/i })
      .or(page.getByLabel(/require mfa|mfa required/i));
    const wasChecked = await mfaToggle.isChecked();
    await mfaToggle.click();
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/saved|updated/i)).toBeVisible({ timeout: 8_000 });

    // Verify toggle state changed
    await expect(mfaToggle).toBeChecked({ checked: !wasChecked });
  });

  test('settings page passes axe-core accessibility check', async ({ page }) => {
    await page.goto('/settings');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
