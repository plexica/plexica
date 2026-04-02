// login-flow.spec.ts
// E2E test: full login flow via Keycloak OIDC PKCE.
// Skips when PLAYWRIGHT_KEYCLOAK_URL is not provided or Keycloak is not reachable.
// NFR-01: login flow completes < 10s. NFR-07: FCP < 1500ms.

import { expect, test } from '@playwright/test';

const KEYCLOAK_URL = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? '';
const KEYCLOAK_USERNAME = process.env['PLAYWRIGHT_KEYCLOAK_USER'] ?? '';
const KEYCLOAK_PASSWORD = process.env['PLAYWRIGHT_KEYCLOAK_PASS'] ?? '';
// AC-1: dashboard heading must include user's first name.
// Set PLAYWRIGHT_USER_FIRST_NAME to the exact first name configured in Keycloak.
// If not set, falls back to the part of the username before the first dot
// (e.g., "alice" from "alice.smith") — this heuristic may not match the
// Keycloak given_name claim; always set the env var explicitly in CI.
const USER_FIRST_NAME =
  process.env['PLAYWRIGHT_USER_FIRST_NAME'] ?? KEYCLOAK_USERNAME.split('.')[0] ?? KEYCLOAK_USERNAME;
const TENANT_SLUG = process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'test-tenant';

const hasKeycloak = KEYCLOAK_URL.length > 0 && KEYCLOAK_USERNAME.length > 0;

test.describe('Login flow', () => {
  test.skip(
    !hasKeycloak,
    'Requires PLAYWRIGHT_KEYCLOAK_URL, PLAYWRIGHT_KEYCLOAK_USER, PLAYWRIGHT_KEYCLOAK_PASS'
  );

  test('navigating to app redirects to Keycloak login page', async ({ page }) => {
    const navigationPromise = page.waitForURL(/\/realms\//);
    await page.goto('/?tenant=' + TENANT_SLUG);
    await navigationPromise;
    await expect(page).toHaveURL(new RegExp(KEYCLOAK_URL));
  });

  test('full login flow completes in < 3s (NFR-01)', async ({ page }) => {
    const start = Date.now();

    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', KEYCLOAK_USERNAME);
    await page.fill('input[name="password"]', KEYCLOAK_PASSWORD);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });

    const elapsed = Date.now() - start;
    // NFR-01: full login flow (navigate → Keycloak login → submit → dashboard) < 3s.
    // This includes browser navigation, Keycloak redirect, PKCE code exchange, and React hydration.
    // Allow 3000ms. If consistently failing in slow CI environments, review Keycloak TTY/startup.
    expect(elapsed, `Login flow took ${elapsed}ms — NFR-01 requires < 3000ms`).toBeLessThan(3000);

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('dashboard shows personalized heading after login (AC-1)', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', KEYCLOAK_USERNAME);
    await page.fill('input[name="password"]', KEYCLOAK_PASSWORD);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForURL('**/dashboard');

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    // AC-1: personalized welcome — heading must contain the user's first name
    await expect(heading).toContainText(USER_FIRST_NAME);
  });

  test('FCP < 1500ms after login (NFR-07)', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', KEYCLOAK_USERNAME);
    await page.fill('input[name="password"]', KEYCLOAK_PASSWORD);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForURL('**/dashboard');

    const fcpEntry = await page.evaluate(() => {
      const entries = performance.getEntriesByType('paint');
      const fcp = entries.find((e) => e.name === 'first-contentful-paint');
      return fcp?.startTime ?? null;
    });

    // P4-L-4: Assert FCP entry is present — a silent null skip means NFR-07 is never enforced.
    // If this fails in headless Chromium CI, add --disable-features=PaintHolding to launch args.
    expect(
      fcpEntry,
      'FCP paint entry must be present — check Playwright Chromium config'
    ).not.toBeNull();
    // TypeScript does not narrow after expect().not.toBeNull(). This guard exists solely for
    // compile-time type narrowing — it is unreachable at runtime because the expect() above
    // already throws if fcpEntry is null. (P6-L-2)
    if (typeof fcpEntry !== 'number')
      throw new Error('unreachable — compile-time type narrowing only');
    expect(fcpEntry).toBeLessThan(1500);
  });
});
