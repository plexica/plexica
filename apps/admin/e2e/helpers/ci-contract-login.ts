// ci-contract-login.ts
// Login + session plumbing for the admin CI runtime contract spec.
//
// The admin app is a super-admin console: it authenticates ONLY against the
// Keycloak master realm (apps/admin/src/stores/auth-store.ts realmResolver)
// with the `plexica-admin` client reconciled to the manifest ADMIN origin
// (e2e/keycloak/plexica-admin-client.ts), and persists its session under the
// `plexica-admin-auth` sessionStorage key. The shared web contract flow cannot
// drive it — its tenant-subdomain navigation rewrites the browser origin and
// Keycloak then rejects the PKCE redirect_uri (live evidence: "Invalid
// parameter: redirect_uri" instead of the login form). This helper keeps the
// browser on the reconciled manifest origin and logs in exactly like the 005
// suite does: run-scoped master identity created by global setup, bootstrap
// credentials stay Admin-REST-only.

import type { Page } from '@playwright/test';

/** Reads global-setup's run-scoped master-realm identity, failing fast. */
export function requireSuperAdminCredentials(): { username: string; password: string } {
  const username = process.env['PLAYWRIGHT_SUPER_ADMIN_USER'] ?? '';
  const password = process.env['PLAYWRIGHT_SUPER_ADMIN_PASS'] ?? '';
  if (username === '' || password === '') {
    throw new Error(
      'CI contract requires PLAYWRIGHT_SUPER_ADMIN_USER and PLAYWRIGHT_SUPER_ADMIN_PASS ' +
        'from global setup (run-scoped master-realm identity).'
    );
  }
  return { username, password };
}

/** Extracts the access token from the admin auth store's persisted state. */
export function parseAdminSessionToken(stored: string | null): string {
  if (stored === null) return '';
  const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
  return parsed.state?.accessToken ?? '';
}

/**
 * Logs the run-scoped super admin in through the real PKCE redirect flow on
 * `baseUrl` (the reconciled `plexica-admin` origin) and returns the browser
 * access token. Selectors target the Keycloak login form fields.
 */
export async function loginSuperAdminForContract(page: Page, baseUrl: string): Promise<string> {
  await page.goto(baseUrl);
  await page.waitForSelector('input[name="username"]');
  const { username, password } = requireSuperAdminCredentials();
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('input[type="submit"], button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
  const stored = await page.evaluate(() => sessionStorage.getItem('plexica-admin-auth'));
  const token = parseAdminSessionToken(stored);
  if (token === '') {
    throw new Error('Authenticated admin browser session has no access token');
  }
  return token;
}
