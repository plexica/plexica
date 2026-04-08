// user-profile.spec.ts
// E2E-08: User profile (Spec 003, Phase 20.8).
// Tests display name update, avatar upload, timezone/language preferences.
// Skips when Keycloak credentials are absent or the stack is not running.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';

test.describe('E2E-08: User profile', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('navigate to /profile shows profile page', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByRole('heading', { name: /profile|account/i })).toBeVisible();
  });

  test('update display name — reflects in header after save', async ({ page }) => {
    await page.goto('/profile');

    const displayNameInput = page.getByLabel(/display name|full name|name/i);
    const newName = uniqueName('Test User');
    await displayNameInput.clear();
    await displayNameInput.fill(newName);
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/saved|updated/i)).toBeVisible({ timeout: 8_000 });

    // The name should appear in the header/nav user menu
    const header = page.getByRole('banner');
    await expect(header.getByText(newName)).toBeVisible();
  });

  test('upload avatar — preview updates on the profile page', async ({ page }) => {
    await page.goto('/profile');

    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: pngBytes,
    });
    await page.getByRole('button', { name: /save|upload/i }).click();

    // Avatar img should be visible after upload
    await expect(page.getByRole('img', { name: /avatar|profile picture/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('change timezone preference — persists on reload', async ({ page }) => {
    await page.goto('/profile');

    const tzSelect = page.getByLabel(/timezone/i);
    await tzSelect.selectOption('Europe/Rome');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/saved|updated/i)).toBeVisible({ timeout: 8_000 });

    await page.reload();
    await expect(page.getByLabel(/timezone/i)).toHaveValue('Europe/Rome');
  });

  test('change language preference — persists on reload', async ({ page }) => {
    await page.goto('/profile');

    const langSelect = page.getByLabel(/language/i);
    await langSelect.selectOption('it');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/saved|updated|salvato/i)).toBeVisible({ timeout: 8_000 });

    await page.reload();
    await expect(page.getByLabel(/language/i)).toHaveValue('it');
  });

  test('/profile page is keyboard-navigable', async ({ page }) => {
    await page.goto('/profile');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });

  test('/profile page passes axe-core accessibility check', async ({ page }) => {
    await page.goto('/profile');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
