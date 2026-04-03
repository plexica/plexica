// keycloak-theme.spec.ts
// E2E tests: Plexica Keycloak custom theme — branded UI + page coverage.
// Verifies that the Plexica theme JAR is loaded by Keycloak (branding elements
// present) and that all custom pages render correctly.
//
// Requires the full stack: docker compose up (Keycloak with plexica-theme.jar).
// Skips when PLAYWRIGHT_KEYCLOAK_URL is not provided.
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
// Login page — Plexica theme branding
// ---------------------------------------------------------------------------

test.describe('Keycloak theme — Login page branding', () => {
  test.skip(
    !hasKeycloak,
    'Requires PLAYWRIGHT_KEYCLOAK_URL, PLAYWRIGHT_KEYCLOAK_USER, PLAYWRIGHT_KEYCLOAK_PASS'
  );

  test('login page shows Plexica branding (.auth-card present)', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await expect(page.locator('.auth-card')).toBeVisible();
  });

  test('login page shows Plexica logo text', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await expect(page.locator('.auth-logo-text')).toHaveText('Plexica');
  });

  test('login page has username and password inputs', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('login page submit button is labelled and enabled', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    const submit = page.locator('button[type="submit"].btn-primary');
    await expect(submit).toBeVisible();
    await expect(submit).toBeEnabled();
  });

  test('login page: invalid credentials shows branded error alert', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', 'invalid-user@plexica.io');
    await page.fill('input[name="password"]', 'wrong-password');
    await page.click('button[type="submit"].btn-primary');
    await page.waitForURL(/\/realms\//);
    await expect(page.locator('.alert.alert-error')).toBeVisible();
    const errorText = await page.locator('.alert.alert-error').textContent();
    expect(errorText?.trim().length).toBeGreaterThan(0);
  });

  test('password toggle button changes input type', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    const passwordInput = page.locator('input#password');
    const toggleButton = page.locator('button.input-toggle');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });
});

// ---------------------------------------------------------------------------
// Reset password page
// ---------------------------------------------------------------------------

test.describe('Keycloak theme — Reset password page', () => {
  test.skip(
    !hasKeycloak,
    'Requires PLAYWRIGHT_KEYCLOAK_URL, PLAYWRIGHT_KEYCLOAK_USER, PLAYWRIGHT_KEYCLOAK_PASS'
  );

  test('forgot-password link navigates to reset-password page', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    const forgotLink = page.locator('a.label-link');
    await expect(forgotLink).toBeVisible();
    await forgotLink.click();
    // Keycloakify SPA: page content changes without a URL pattern change.
    // Wait for the reset-password specific input to confirm the page switched.
    await expect(page.getByRole('heading', { name: /forgot/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.auth-card')).toBeVisible();
    await expect(page.locator('.auth-logo-text')).toHaveText('Plexica');
  });

  test('reset-password page has username input and submit button', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.locator('a.label-link').click();
    await expect(page.getByRole('heading', { name: /forgot/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('button[type="submit"].btn-primary')).toBeVisible();
  });

  test('reset-password page has back-to-login link', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.locator('a.label-link').click();
    await expect(page.getByRole('heading', { name: /forgot/i })).toBeVisible({ timeout: 10_000 });
    const backLink = page.locator('.auth-footer a');
    await expect(backLink).toBeVisible();
    await backLink.click();
    // Back to login: wait for login form (username input visible, no reset-password heading)
    await expect(page.locator('input[name="username"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.auth-card')).toBeVisible();
  });
});

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

// ---------------------------------------------------------------------------
// Accessibility — focus management (WCAG 2.4.7)
// ---------------------------------------------------------------------------

test.describe('Keycloak theme — Accessibility', () => {
  test.skip(
    !hasKeycloak,
    'Requires PLAYWRIGHT_KEYCLOAK_URL, PLAYWRIGHT_KEYCLOAK_USER, PLAYWRIGHT_KEYCLOAK_PASS'
  );

  test('submit button is reachable by keyboard and receives focus', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);

    // Wait for the React SPA to mount and autoFocus to fire on the username input.
    // Once this is visible, document.activeElement is already on #username.
    await page.locator('#username').waitFor({ state: 'visible' });

    // Tab order from #username (autoFocused):
    //   Tab 1 → "Forgot password" link (label-row, before password input in DOM)
    //   Tab 2 → password input
    //   Tab 3 → toggle button (.input-toggle)
    //   Tab 4 → submit button (.btn.btn-primary)
    await page.keyboard.press('Tab'); // forgot-password link
    await page.keyboard.press('Tab'); // password input
    await page.keyboard.press('Tab'); // toggle button
    await page.keyboard.press('Tab'); // submit button

    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focused).toContain('btn-primary');
  });

  test('toggle password button is focusable via keyboard', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);

    // Wait for the React SPA to mount and autoFocus to fire on the username input.
    await page.locator('#username').waitFor({ state: 'visible' });

    // Tab order from #username (autoFocused):
    //   Tab 1 → "Forgot password" link
    //   Tab 2 → password input
    //   Tab 3 → toggle button (.input-toggle)
    await page.keyboard.press('Tab'); // forgot-password link
    await page.keyboard.press('Tab'); // password input
    await page.keyboard.press('Tab'); // toggle button

    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focused).toContain('input-toggle');
  });

  test('no Google Fonts external requests on login page', async ({ page }) => {
    const externalFontRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        externalFontRequests.push(url);
      }
    });

    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.waitForLoadState('networkidle');

    expect(
      externalFontRequests,
      'GDPR: no external Google Fonts requests on login page'
    ).toHaveLength(0);
  });
});
