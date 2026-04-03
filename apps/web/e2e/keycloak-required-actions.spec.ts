// keycloak-required-actions.spec.ts
// E2E tests: Plexica Keycloak custom theme — required actions pages
// (Update Password and Update Profile first-login flows).
//
// Split from keycloak-theme.spec.ts (343 lines → two files) to satisfy
// Constitution Rule 4 (no file above 200 lines).
//
// Requires users with the respective required actions set in Keycloak.
// Skips each describe block when the corresponding env vars are not set.
//
// Spec: ADR-010 (Keycloakify theme), Constitution Rule 1 (every feature has E2E).

import { expect, test } from './helpers/base-fixture.js';

const KEYCLOAK_URL = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? '';
const KEYCLOAK_USERNAME = process.env['PLAYWRIGHT_KEYCLOAK_USER'] ?? '';
const TENANT_SLUG = process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'test-tenant';

// Optional: user that has "Update Password" required action set in Keycloak.
const FORCE_PASSWORD_USER = process.env['PLAYWRIGHT_FORCE_PASSWORD_USER'] ?? '';
const FORCE_PASSWORD_PASS = process.env['PLAYWRIGHT_FORCE_PASSWORD_PASS'] ?? '';

// Optional: user that has "Update Profile" required action set in Keycloak.
const FORCE_PROFILE_USER = process.env['PLAYWRIGHT_FORCE_PROFILE_USER'] ?? '';
const FORCE_PROFILE_PASS = process.env['PLAYWRIGHT_FORCE_PROFILE_PASS'] ?? '';

const hasKeycloak = KEYCLOAK_URL.length > 0 && KEYCLOAK_USERNAME.length > 0;
const hasForcePasswordUser = FORCE_PASSWORD_USER.length > 0 && FORCE_PASSWORD_PASS.length > 0;
const hasForceProfileUser = FORCE_PROFILE_USER.length > 0 && FORCE_PROFILE_PASS.length > 0;

// ---------------------------------------------------------------------------
// Update password page (first-login required action)
// ---------------------------------------------------------------------------

test.describe('Keycloak theme — Update password page', () => {
  test.skip(
    !hasKeycloak || !hasForcePasswordUser,
    'Requires PLAYWRIGHT_FORCE_PASSWORD_USER + PLAYWRIGHT_FORCE_PASSWORD_PASS ' +
      '(user with "Update Password" required action set in Keycloak)'
  );

  test('update-password page shows Plexica branding', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', FORCE_PASSWORD_USER);
    await page.fill('input[name="password"]', FORCE_PASSWORD_PASS);
    await page.click('button[type="submit"].btn-primary');
    // Keycloakify SPA: wait for the update-password specific field
    await expect(page.locator('input[name="password-new"]')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('.auth-card')).toBeVisible();
    await expect(page.locator('.auth-logo-text')).toHaveText('Plexica');
  });

  test('update-password page has new-password and confirm-password fields', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', FORCE_PASSWORD_USER);
    await page.fill('input[name="password"]', FORCE_PASSWORD_PASS);
    await page.click('button[type="submit"].btn-primary');
    await expect(page.locator('input[name="password-new"]')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('input[name="password-new"]')).toBeVisible();
    await expect(page.locator('input[name="password-confirm"]')).toBeVisible();
  });

  test('update-password: new-password toggle changes input type', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', FORCE_PASSWORD_USER);
    await page.fill('input[name="password"]', FORCE_PASSWORD_PASS);
    await page.click('button[type="submit"].btn-primary');
    await expect(page.locator('input[name="password-new"]')).toBeVisible({ timeout: 10_000 });

    const newPasswordInput = page.locator('input#password-new');
    const toggleButtons = page.locator('button.input-toggle');

    await expect(newPasswordInput).toHaveAttribute('type', 'password');
    await toggleButtons.first().click();
    await expect(newPasswordInput).toHaveAttribute('type', 'text');
  });

  test('update-password: mismatch shows confirm-password error', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', FORCE_PASSWORD_USER);
    await page.fill('input[name="password"]', FORCE_PASSWORD_PASS);
    await page.click('button[type="submit"].btn-primary');
    await expect(page.locator('input[name="password-new"]')).toBeVisible({ timeout: 10_000 });

    await page.fill('input[name="password-new"]', 'NewPassword1!');
    await page.fill('input[name="password-confirm"]', 'DifferentPassword1!');
    await page.click('button[type="submit"].btn-primary');

    // Keycloak re-renders the page with an error
    await expect(page.locator('.form-error')).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Update profile page (first-login required action)
// ---------------------------------------------------------------------------

test.describe('Keycloak theme — Update profile page', () => {
  test.skip(
    !hasKeycloak || !hasForceProfileUser,
    'Requires PLAYWRIGHT_FORCE_PROFILE_USER + PLAYWRIGHT_FORCE_PROFILE_PASS ' +
      '(user with "Update Profile" required action set in Keycloak)'
  );

  test('update-profile page shows Plexica branding', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', FORCE_PROFILE_USER);
    await page.fill('input[name="password"]', FORCE_PROFILE_PASS);
    await page.click('button[type="submit"].btn-primary');
    // Keycloakify SPA: wait for the profile form to appear
    await expect(page.locator('.form-group').first()).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('.auth-card')).toBeVisible();
    await expect(page.locator('.auth-logo-text')).toHaveText('Plexica');
  });

  test('update-profile page renders profile fields with our CSS classes', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', FORCE_PROFILE_USER);
    await page.fill('input[name="password"]', FORCE_PROFILE_PASS);
    await page.click('button[type="submit"].btn-primary');
    await expect(page.locator('.form-group').first()).toBeVisible({ timeout: 10_000 });

    // Profile form uses .form-group and .form-input classes (our design system)
    const formGroupCount = await page.locator('.form-group').count();
    expect(formGroupCount).toBeGreaterThanOrEqual(1);
    const formInputCount = await page.locator('input.form-input').count();
    expect(formInputCount).toBeGreaterThanOrEqual(1);
  });

  test('update-profile page has a submit button', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', FORCE_PROFILE_USER);
    await page.fill('input[name="password"]', FORCE_PROFILE_PASS);
    await page.click('button[type="submit"].btn-primary');
    await expect(page.locator('.form-group').first()).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('button[type="submit"].btn-primary')).toBeVisible();
    await expect(page.locator('button[type="submit"].btn-primary')).toBeEnabled();
  });

  test('update-profile: readonly fields are visually disabled', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', FORCE_PROFILE_USER);
    await page.fill('input[name="password"]', FORCE_PROFILE_PASS);
    await page.click('button[type="submit"].btn-primary');
    await expect(page.locator('.form-group').first()).toBeVisible({ timeout: 10_000 });

    // If any readonly fields exist, they must have the .readonly CSS class
    const readonlyInputs = page.locator('input.form-input[readonly]');
    const count = await readonlyInputs.count();
    if (count > 0) {
      await expect(readonlyInputs.first()).toHaveClass(/readonly/);
    }
  });
});
