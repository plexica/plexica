// admin-login.ts
// Super-admin login helper for the admin app E2E suite.
//
// Uses PKCE Authorization Code browser redirect flow (same pattern as the
// web app's keycloak-login.ts). Navigates to the admin app, waits for the
// Keycloak redirect, fills the login form, and waits for redirect back.
//
// This helper does NOT use direct password grant — directAccessGrantsEnabled
// has been removed from the plexica-admin client (ADR-023, Phase C).

import type { Page } from '@playwright/test';

// Global setup creates this run-scoped identity; bootstrap credentials are Admin REST only.
export const SUPER_ADMIN_USERNAME = process.env['PLAYWRIGHT_SUPER_ADMIN_USER'] ?? '';
export const SUPER_ADMIN_PASSWORD = process.env['PLAYWRIGHT_SUPER_ADMIN_PASS'] ?? '';

export const hasKeycloak = SUPER_ADMIN_USERNAME.length > 0 && SUPER_ADMIN_PASSWORD.length > 0;

/**
 * Throws in CI when super-admin credentials are absent.
 * Prevents silent green-with-zero-tests CI runs (Constitution Rules 1 and 2).
 * Call inside `test.beforeAll()` in every suite that requires admin login.
 */
export function requireKeycloakInCI(): void {
  if (process.env['CI'] !== undefined && !hasKeycloak) {
    throw new Error(
      'CI requires PLAYWRIGHT_SUPER_ADMIN_USER and PLAYWRIGHT_SUPER_ADMIN_PASS to be set.'
    );
  }
}

/**
 * Logs in as the super admin via the PKCE browser redirect flow.
 *
 * 1. Navigate to the admin app root → redirected to Keycloak master realm
 * 2. Fill the Keycloak login form with super-admin credentials
 * 3. Submit → redirected back to /dashboard
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/');
  // Wait for the Keycloak login form to appear after the PKCE redirect.
  // Using waitForSelector instead of waitForURL because the URL navigation
  // can race with React's useEffect-based login redirect in Strict Mode.
  await page.waitForSelector('input[name="username"]');
  await page.fill('input[name="username"]', SUPER_ADMIN_USERNAME);
  await page.fill('input[name="password"]', SUPER_ADMIN_PASSWORD);
  await page.click('input[type="submit"], button[type="submit"]');
  // 10s timeout — fails fast on Keycloak misconfiguration rather than
  // silently hanging for the 30s default.
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
}

/**
 * Generates a unique name with a timestamp suffix.
 * Prevents test pollution between runs.
 */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
