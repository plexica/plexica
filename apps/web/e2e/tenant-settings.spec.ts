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

    // i18n label: 'Organization name'
    const nameInput = page.getByLabel(/organization name/i);
    await nameInput.clear();
    const newName = uniqueName('Tenant');
    await nameInput.fill(newName);
    await page.getByRole('button', { name: /save/i }).click();

    // After save the mutation invalidates the query; wait for the input to
    // reflect the new value (TanStack Query refetch).
    await expect(nameInput).toHaveValue(newName, { timeout: 8_000 });
  });

  test('upload logo — preview updates on settings page', async ({ page }) => {
    await page.goto('/settings/branding');
    await expect(page).toHaveURL(/\/settings\/branding/);

    // Prepare a minimal 1×1 PNG as a Buffer for upload
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    // FileUpload renders a hidden <input type="file"> inside the drop zone
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: pngBytes,
    });

    // FileUpload shows a local preview with alt="Preview" immediately after
    // file selection (before saving).
    await expect(page.getByRole('img', { name: /preview/i })).toBeVisible({ timeout: 10_000 });
  });

  test('change primary color — hex input reflects new value', async ({ page }) => {
    await page.goto('/settings/branding');

    // ColorPicker renders <input type="color"> and a text hex input.
    // The text input is a React controlled component that only propagates
    // valid hex values (#xxxxxx). Using the native color input with
    // React-compatible value setter to trigger onChange.
    const colorInput = page.locator('input[type="color"]');
    await colorInput.evaluate((el: HTMLInputElement) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(el, '#ff6b35');
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Verify the hex text input updated reactively
    const hexInput = page.getByRole('textbox', { name: /primary color hex value/i });
    await expect(hexInput).toHaveValue('#ff6b35', { timeout: 5_000 });

    // Click save and wait for the PATCH response
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/tenant/branding') && r.request().method() === 'PATCH'
      ),
      page.getByRole('button', { name: /save/i }).click(),
    ]);

    // Verify the PATCH was successful
    expect(response.status()).toBeLessThan(400);

    // Reload and verify the value persisted
    await page.reload();
    await expect(page.getByRole('textbox', { name: /primary color hex value/i })).toHaveValue(
      '#ff6b35',
      { timeout: 8_000 }
    );
  });

  test('toggle dark mode — switch state changes', async ({ page }) => {
    // Dark mode toggle is on the branding page, not general settings
    await page.goto('/settings/branding');

    // ToggleSwitch uses Radix Switch → role="switch". Label: 'Dark mode'.
    const darkModeToggle = page.getByRole('switch', { name: /dark mode/i });
    const wasChecked = await darkModeToggle.isChecked();
    await darkModeToggle.click();

    // Verify toggle state changed
    await expect(darkModeToggle).toBeChecked({ checked: !wasChecked });
  });

  test('update auth config — brute force protection toggle', async ({ page }) => {
    await page.goto('/settings/auth');
    await expect(page).toHaveURL(/\/settings\/auth/);

    // ToggleSwitch uses Radix Switch → role="switch". Label: 'Brute force protection'.
    const bfToggle = page.getByRole('switch', { name: /brute force protection/i });
    const wasChecked = await bfToggle.isChecked();
    await bfToggle.click();
    await page.getByRole('button', { name: /save/i }).click();

    // After save, the mutation invalidates the query. Reload to verify persistence.
    await page.reload();
    await expect(page.getByRole('switch', { name: /brute force protection/i })).toBeChecked({
      checked: !wasChecked,
      timeout: 8_000,
    });
  });

  test('settings page passes axe-core accessibility check', async ({ page }) => {
    await page.goto('/settings');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
