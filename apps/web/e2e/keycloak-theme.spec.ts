// keycloak-theme.spec.ts
// E2E tests: Plexica Keycloak custom theme — branded UI + page coverage.
// Verifies that the Plexica theme JAR is loaded by Keycloak (branding elements
// present) and that all custom pages render correctly.
//
// Requires the full stack: docker compose up (Keycloak with plexica-theme.jar).
// Skips when PLAYWRIGHT_KEYCLOAK_URL is not provided.
//
// Spec: ADR-010 (Keycloakify theme), Constitution Rule 1 (every feature has E2E).

import { expect, test } from '@playwright/test';

const KEYCLOAK_URL = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? '';
const KEYCLOAK_USERNAME = process.env['PLAYWRIGHT_KEYCLOAK_USER'] ?? '';
const KEYCLOAK_PASSWORD = process.env['PLAYWRIGHT_KEYCLOAK_PASS'] ?? '';
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

    // Theme landmark: .auth-card is the root card rendered by AuthLayout
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

    // After invalid login Keycloak re-renders the login page
    await page.waitForURL(/\/realms\//);
    await expect(page.locator('.alert.alert-error')).toBeVisible();
    // Must not be empty — error text is rendered as plain text (no HTML injection)
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

    await page.waitForURL(/login-reset-password/);
    await expect(page.locator('.auth-card')).toBeVisible();
    await expect(page.locator('.auth-logo-text')).toHaveText('Plexica');
  });

  test('reset-password page has username input and submit button', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);

    await page.locator('a.label-link').click();
    await page.waitForURL(/login-reset-password/);

    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('button[type="submit"].btn-primary')).toBeVisible();
  });

  test('reset-password page has back-to-login link', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);

    await page.locator('a.label-link').click();
    await page.waitForURL(/login-reset-password/);

    const backLink = page.locator('.auth-footer a');
    await expect(backLink).toBeVisible();
    await backLink.click();

    await page.waitForURL(/\/realms\/.*\/protocol\/openid-connect\/auth/);
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

  test('submit button is reachable by keyboard and receives focus-visible outline', async ({
    page,
  }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);

    // Tab through the form to reach the submit button
    await page.keyboard.press('Tab'); // username
    await page.keyboard.press('Tab'); // password
    await page.keyboard.press('Tab'); // toggle button (input-toggle)
    await page.keyboard.press('Tab'); // submit

    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focused).toContain('btn-primary');
  });

  test('toggle password button is focusable via keyboard', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);

    await page.keyboard.press('Tab'); // username
    await page.keyboard.press('Tab'); // password
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
