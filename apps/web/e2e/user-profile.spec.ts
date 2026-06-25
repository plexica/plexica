// user-profile.spec.ts
// E2E-08: User profile (Spec 003, Phase 20.8).
// Tests display name update, avatar upload, timezone/language preferences.
// Timezone and language use Radix <Select> (button trigger + listbox popup).
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
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: pngBytes,
    });

    await expect(page.getByRole('img', { name: /preview/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('change timezone — Select value persists', async ({ page }) => {
    await page.goto('/profile');

    // Timezone is now a Radix <Select> (button trigger + listbox popup).
    // i18n: profile.timezone.label = 'Timezone'
    const tzTrigger = page.getByRole('combobox', { name: /timezone/i });
    await tzTrigger.click();
    // Select "Europe/Rome" from the listbox
    await page.getByRole('option', { name: 'Europe Rome' }).click();
    await page.getByRole('button', { name: /save/i }).click();

    // Verify persists after reload — the trigger shows the selected value
    await page.reload();
    await expect(page.getByRole('combobox', { name: /timezone/i })).toHaveText('Europe Rome', { timeout: 8_000 });
  });

  test('change language — Select value persists', async ({ page }) => {
    await page.goto('/profile');

    // Language is now a Radix <Select> (button trigger + listbox popup).
    // i18n: profile.language.label = 'Language'
    const langTrigger = page.getByRole('combobox', { name: /language/i });
    await langTrigger.click();
    // Select "Italiano" (value 'it')
    await page.getByRole('option', { name: 'Italiano' }).click();
    await page.getByRole('button', { name: /save/i }).click();

    // Verify persists after reload
    await page.reload();
    await expect(page.getByRole('combobox', { name: /language/i })).toHaveText('Italiano', { timeout: 8_000 });

    // Reset to English to avoid breaking other tests
    const langTriggerAfter = page.getByRole('combobox', { name: /language/i });
    await langTriggerAfter.click();
    await page.getByRole('option', { name: 'English' }).click();
    await page.getByRole('button', { name: /save/i }).click();
    await page.reload();
  });

  test('/profile page is keyboard-navigable', async ({ page }) => {
    await page.goto('/profile');
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
