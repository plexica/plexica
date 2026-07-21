// admin-login.ts
// Super-admin login helper for the admin app E2E suite.
//
// The admin app uses PKCE Authorization Code flow (browser redirect to Keycloak).
// To avoid handling the Keycloak redirect flow in every E2E test, this helper
// obtains tokens via the Keycloak API (direct password grant — kept enabled on
// the plexica-admin client for E2E) and injects them into the page's
// sessionStorage before navigation. This simulates a completed PKCE login
// without the browser round-trip.
//
// IMPORTANT: This relies on directAccessGrantsEnabled: true on the
// plexica-admin Keycloak client. The global-setup ensures this.

import type { Page } from '@playwright/test';

// Master realm super-admin credentials. Defaults match the Keycloak container
// bootstrap (admin/changeme). Override via env vars in CI.
export const SUPER_ADMIN_USERNAME = process.env['PLAYWRIGHT_SUPER_ADMIN_USER'] ?? 'admin';
export const SUPER_ADMIN_PASSWORD = process.env['PLAYWRIGHT_SUPER_ADMIN_PASS'] ?? 'changeme';

export const hasKeycloak =
  SUPER_ADMIN_USERNAME.length > 0 && SUPER_ADMIN_PASSWORD.length > 0;

const KEYCLOAK_URL = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8080';
const CLIENT_ID = process.env['KEYCLOAK_ADMIN_CLIENT_ID'] ?? 'plexica-admin';

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

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
}

/**
 * Obtain tokens from Keycloak via direct password grant.
 * Uses the plexica-admin client (directAccessGrantsEnabled must be true).
 */
async function getTokens(): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    username: SUPER_ADMIN_USERNAME,
    password: SUPER_ADMIN_PASSWORD,
    scope: 'openid profile email',
  });

  const response = await fetch(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  );

  if (!response.ok) {
    throw new Error(`Admin E2E login failed: ${response.status}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/**
 * Logs in as the super admin by injecting tokens directly into sessionStorage
 * and navigating to /dashboard.
 *
 * This avoids the PKCE browser redirect flow in E2E tests. The tokens are
 * obtained via Keycloak's password grant API (kept enabled for E2E).
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  const tokens = await getTokens();
  const tokenPayload = JSON.parse(
    atob(tokens.access_token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))
  );

  await page.goto('/');
  await page.evaluate(
    ({ accessToken, refreshToken, idToken, tokenPayload }) => {
      const profile = {
        id: tokenPayload.sub ?? '',
        email: tokenPayload.email ?? '',
        firstName: tokenPayload.given_name ?? '',
        lastName: tokenPayload.family_name ?? '',
        realm: 'master',
        roles: tokenPayload.realm_access?.roles ?? [],
      };

      window.sessionStorage.setItem(
        'plexica-admin-auth',
        JSON.stringify({
          state: {
            accessToken,
            refreshToken,
            idToken,
            userProfile: profile,
          },
          version: 0,
        })
      );
    },
    { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, idToken: tokens.id_token, tokenPayload }
  );

  // Navigate to dashboard — the auth guard will find the tokens in sessionStorage.
  await page.goto('/dashboard');
  // Wait for the dashboard to render after hydration.
  await page.waitForTimeout(1_000);
}

/**
 * Generates a unique name with a timestamp suffix.
 * Prevents test pollution between runs.
 */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
