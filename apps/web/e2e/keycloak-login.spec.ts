// keycloak-login.spec.ts
// E2E tests: Plexica Keycloak custom theme — login branding, reset password,
// and accessibility (WCAG 2.4.7 focus management).
//
// Split from keycloak-theme.spec.ts (343 lines → two files) to satisfy
// Constitution Rule 4 (no file above 200 lines).
//
// Requires the full stack: docker compose up (Keycloak with plexica-theme.jar).
// Skips when PLAYWRIGHT_KEYCLOAK_URL is not provided.
//
// Spec: ADR-010 (Keycloakify theme), Constitution Rule 1 (every feature has E2E).

import { expect, test } from './helpers/base-fixture.js';

const KEYCLOAK_URL = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? '';
const KEYCLOAK_USERNAME = process.env['PLAYWRIGHT_KEYCLOAK_USER'] ?? '';
const TENANT_SLUG = process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'test-tenant';

const hasKeycloak = KEYCLOAK_URL.length > 0 && KEYCLOAK_USERNAME.length > 0;

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
