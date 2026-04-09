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
    // i18n: profile.title = 'Profile'
    await expect(page.getByRole('heading', { name: /profile/i })).toBeVisible();
  });

  test('update display name — persists after reload', async ({ page }) => {
    await page.goto('/profile');

    // i18n: profile.displayName.label = 'Display name'
    const displayNameInput = page.getByLabel(/display name/i);
    const newName = uniqueName('Test User');
    await displayNameInput.clear();
    await displayNameInput.fill(newName);
    await page.getByRole('button', { name: /save/i }).click();

    // Verify the value persists after reload (TanStack Query refetch)
    await page.reload();
    await expect(page.getByLabel(/display name/i)).toHaveValue(newName, { timeout: 8_000 });
  });

  test('upload avatar — preview updates on the profile page', async ({ page }) => {
    await page.goto('/profile');

    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    // FileUpload renders a hidden <input type="file"> outside the drop zone
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: pngBytes,
    });

    // FileUpload shows local preview with alt="Preview" immediately
    await expect(page.getByRole('img', { name: /preview/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('change timezone — input value updates', async ({ page }) => {
    await page.goto('/profile');

    // Timezone is an <input> element, not a <select>.
    // i18n: profile.timezone.label = 'Timezone'
    const tzInput = page.getByLabel(/timezone/i);
    await tzInput.clear();
    await tzInput.fill('Europe/Rome');
    await page.getByRole('button', { name: /save/i }).click();

    // Verify persists after reload
    await page.reload();
    await expect(page.getByLabel(/timezone/i)).toHaveValue('Europe/Rome', { timeout: 8_000 });
  });

  test('change language — input value updates', async ({ page }) => {
    await page.goto('/profile');

    // Language is an <input> element, not a <select>.
    // i18n: profile.language.label = 'Language'
    const langInput = page.getByLabel(/language/i);
    await langInput.clear();
    await langInput.fill('it');
    await page.getByRole('button', { name: /save/i }).click();

    // Verify persists after reload
    await page.reload();
    await expect(page.getByLabel(/language/i)).toHaveValue('it', { timeout: 8_000 });

    // Reset to English to avoid breaking other tests
    const langInputAfter = page.getByLabel(/language|lingua/i);
    await langInputAfter.clear();
    await langInputAfter.fill('en');
    await page.getByRole('button', { name: /save|salva/i }).click();
    await page.reload();
  });

  test('/profile page is keyboard-navigable', async ({ page }) => {
    await page.goto('/profile');
    // Wait for the profile heading to ensure page is fully loaded
    await expect(page.getByRole('heading', { name: /profile/i })).toBeVisible();
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
