// admin-login.ts
// Super-admin login helper for the admin app E2E suite.
//
// The admin app uses a direct password-grant form served at /login (no Keycloak
// browser PKCE flow). Credentials authenticate against the Keycloak master
// realm. After a successful login the auth store persists tokens in
// sessionStorage (key `plexica-admin-auth`) and the router navigates to
// /dashboard.

import type { Page } from '@playwright/test';

// Master realm super-admin credentials. Defaults match the Keycloak container
// bootstrap (admin/changeme). Override via env vars in CI.
export const SUPER_ADMIN_USERNAME = process.env['PLAYWRIGHT_SUPER_ADMIN_USER'] ?? 'admin';
export const SUPER_ADMIN_PASSWORD = process.env['PLAYWRIGHT_SUPER_ADMIN_PASS'] ?? 'changeme';

export const hasKeycloak =
  SUPER_ADMIN_USERNAME.length > 0 && SUPER_ADMIN_PASSWORD.length > 0;

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
 * Logs in as the super admin via the /login form and waits for /dashboard.
 *
 * The form fields are targeted by their DOM ids (`#username`, `#password`),
 * which are stable across i18n label changes (labels come from react-intl).
 * Returns void — the page is authenticated via sessionStorage after redirect.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  // Log Keycloak token request status (do NOT read body — would consume
  // the stream and break the React app's response.json() call).
  await page.route('**/realms/**/token', async (route) => {
    const response = await route.fetch();
    process.stdout.write(
      `[loginAsAdmin] Keycloak token response: ${String(response.status())}\n`
    );
  });
  // Log admin API response status only (not body) for the same reason.
  await page.route('**/api/v1/admin/**', async (route) => {
    const response = await route.fetch();
    process.stdout.write(
      `[loginAsAdmin] Admin API ${route.request().method()} ${route.request().url()}: ${String(response.status())}\n`
    );
  });

  await page.goto('/login');
  await page.fill('#username', SUPER_ADMIN_USERNAME);
  await page.fill('#password', SUPER_ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for the post-login redirect to the dashboard.
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
}

/**
 * Generates a unique name with a timestamp suffix.
 * Prevents test pollution between runs.
 */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
