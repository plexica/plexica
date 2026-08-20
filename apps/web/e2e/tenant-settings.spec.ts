// tenant-settings.spec.ts
// E2E-07: Tenant settings (Spec 003, Phase 20.7).
// Tests display name update, logo upload, primary color, dark mode, auth config.
// Every mutating test asserts the SERVER round-trip (exact pathname + 200 +
// persistence after reload), never just the local form state.
// Accessibility coverage lives in tenant-settings-a11y.spec.ts
// (Constitution Rule 4 — no file above 200 lines).
// Skips when Keycloak credentials are absent or the stack is not running.

import { expect, test } from './helpers/base-fixture.js';
import { expectResponseTo } from './helpers/api-response.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import {
  AUTH_CONFIG_PATH,
  BRANDING_PATH,
  PNG_1X1,
  restoreBruteForce,
  restoreDarkMode,
  restoreDisplayName,
  restorePrimaryColor,
  runCleanups,
  SETTINGS_PATH,
} from './helpers/settings-fixtures.js';

import type { Cleanup } from './helpers/settings-fixtures.js';

test.describe('E2E-07: Tenant settings', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  // Cleanups registered by a test run in afterEach, which Playwright executes
  // even when the test body fails or times out (see settings-fixtures.ts).
  // EVERY test that mutates persistent tenant or realm state must register one:
  // primary colour and brute-force protection used to skip this and stayed
  // inverted across runs.
  let cleanups: Cleanup[] = [];

  test.beforeEach(async ({ page }) => {
    cleanups = [];
    await loginAsAdmin(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    const pending = cleanups;
    cleanups = [];
    // Isolated + deadline-bounded: a failing cleanup neither aborts the others
    // nor turns a green test red, and cannot eat the budget and mask a real
    // failure with a spurious "timeout in afterEach hook".
    await runCleanups(page, pending, testInfo);
  });

  test('update tenant display name — server persists it', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);

    // i18n: settings.general.displayName.label = 'Organization name'
    const nameInput = page.getByLabel(/organization name/i);
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    const originalName = await nameInput.inputValue();
    cleanups.push(restoreDisplayName(originalName));

    const newName = uniqueName('Tenant');
    await nameInput.clear();
    await nameInput.fill(newName);

    // Asserting toHaveValue(newName) right after fill() would be tautological:
    // the test itself typed that value, so it passes even when the PATCH 500s,
    // never fires, or the backend is down. The server round-trip below is what
    // actually makes this test meaningful.
    await expectResponseTo(page, SETTINGS_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });

    await page.reload();
    await expect(page.getByLabel(/organization name/i)).toHaveValue(newName, {
      timeout: 15_000,
    });
  });

  test('upload logo — file is persisted and served back as a real URL', async ({ page }) => {
    await page.goto('/settings/branding');
    await expect(page).toHaveURL(/\/settings\/branding/);

    // FileUpload renders a hidden <input type="file"> inside the drop zone.
    // Selecting a file calls onFile() immediately, which triggers the multipart
    // PATCH /api/v1/tenant/branding (settings-api.ts uploadLogo).
    const fileInput = page.locator('input[type="file"]');
    await expectResponseTo(page, BRANDING_PATH, 'PATCH', async () => {
      await fileInput.setInputFiles({
        name: 'logo.png',
        mimeType: 'image/png',
        buffer: PNG_1X1,
      });
    });

    // The preview shown right after selection is a client-side artifact:
    // packages/ui/src/components/file-upload.tsx:64 does URL.createObjectURL(file)
    // and renders <img src="blob:…">, visible even when the upload fails.
    // Reloading drops that local blob state, so the <img> can only render from
    // data.logoUrl (tenant-branding-page.tsx:74) — a presigned MinIO URL built
    // by the server. That proves the bytes were stored and are readable back.
    await page.reload();
    const preview = page.getByRole('img', { name: /preview/i });
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).not.toHaveAttribute('src', /^blob:/);
    await expect(preview).toHaveAttribute('src', /^https?:\/\//);
  });

  test('change primary color — server persists the new hex', async ({ page }) => {
    await page.goto('/settings/branding');

    const hexInput = page.getByRole('textbox', { name: /primary color hex value/i });
    await expect(hexInput).toBeVisible({ timeout: 15_000 });
    const currentColor = await hexInput.inputValue();
    cleanups.push(restorePrimaryColor(currentColor));
    // Pick a value guaranteed to differ, otherwise the form is not dirty and
    // Save stays disabled (SaveBar: disabled={!isDirty}).
    const newColor = currentColor.toLowerCase() === '#ff6b35' ? '#2563eb' : '#ff6b35';
    await hexInput.fill(newColor);

    await expectResponseTo(page, BRANDING_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });

    await page.reload();
    await expect(page.getByRole('textbox', { name: /primary color hex value/i })).toHaveValue(
      newColor,
      { timeout: 15_000 }
    );
  });

  test('toggle dark mode — server persists the flag', async ({ page }) => {
    // The dark-mode toggle lives on the branding page, not on general settings.
    await page.goto('/settings/branding');

    // SCOPE NOTE — this test asserts persistence, NOT theme application.
    // The design tokens define the dark palette under the [data-theme="dark"]
    // selector (packages/ui/src/tokens/colors.css:54), but nothing in the
    // frontend ever sets that attribute: there is no classList/setAttribute
    // call in apps/web/src or packages/ui/src, and apps/web/tailwind.config.ts
    // does not configure a `darkMode` strategy. The flag is round-tripped to
    // the API and read back into local state (tenant-branding-page.tsx:34-41)
    // and nothing else. Asserting a `dark` class / `data-theme` attribute here
    // would assert behaviour the application does not implement.
    const toggle = page.getByRole('switch', { name: /dark mode/i });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    const wasChecked = await toggle.isChecked();
    cleanups.push(restoreDarkMode(wasChecked));

    await toggle.click();
    const response = await expectResponseTo(page, BRANDING_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });
    expect(await response.json()).toMatchObject({ darkMode: !wasChecked });

    await page.reload();
    await expect(page.getByRole('switch', { name: /dark mode/i })).toBeChecked({
      checked: !wasChecked,
      timeout: 15_000,
    });
  });

  test('update auth config — brute force protection persists', async ({ page }) => {
    await page.goto('/settings/auth');
    await expect(page).toHaveURL(/\/settings\/auth/);

    const bfToggle = page.getByRole('switch', { name: /brute force protection/i });
    await expect(bfToggle).toBeVisible({ timeout: 15_000 });
    const wasChecked = await bfToggle.isChecked();
    // Realm-level state: without this the brute-force setting stays inverted for
    // every later test and for the next run.
    cleanups.push(restoreBruteForce(wasChecked));
    await bfToggle.click();

    // Reloading straight after click() raced the PATCH: the navigation could
    // abort the in-flight request, making the test flaky.
    await expectResponseTo(page, AUTH_CONFIG_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });

    await page.reload();
    await expect(page.getByRole('switch', { name: /brute force protection/i })).toBeChecked({
      checked: !wasChecked,
      timeout: 15_000,
    });
  });
});
