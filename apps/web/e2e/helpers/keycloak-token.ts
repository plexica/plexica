// keycloak-token.ts
// Mint a fresh access token from the browser's persisted refresh token.
//
// The realm access token TTL is 60s by design (H-04 in
// keycloak-admin-helpers.ts); the frontend api-client silently refreshes on
// 401. Direct page.request.* E2E calls bypass the app's api-client, so a
// token captured once expires during long flows (CRM install + health poll
// routinely exceeds 60s under CI load). This helper performs the same
// refresh_token grant the app uses, so long-lived fixture flows always carry
// a valid token.

import { expect } from '@playwright/test';

import { ADMIN_TENANT_SLUG } from './admin-login.js';

import type { Page } from '@playwright/test';

export async function refreshBrowserToken(page: Page): Promise<string> {
  const refreshToken = await page.evaluate(() => {
    const stored = sessionStorage.getItem('plexica-auth');
    if (stored === null) return '';
    const parsed = JSON.parse(stored) as { state?: { refreshToken?: string } };
    return parsed.state?.refreshToken ?? '';
  });
  expect(refreshToken, 'browser session has a refresh token').not.toBe('');
  const keycloakUrl = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? 'http://localhost:8080';
  // Never forward the refresh token over plain HTTP to a non-loopback host
  // (CodeRabbit): HTTPS is fine; HTTP is only acceptable for local Keycloak.
  const parsedUrl = new URL(keycloakUrl);
  const isLoopback =
    parsedUrl.hostname === 'localhost' ||
    parsedUrl.hostname === '127.0.0.1' ||
    parsedUrl.hostname === '::1';
  if (parsedUrl.protocol === 'http:' && !isLoopback) {
    throw new Error(
      `Refusing to send the refresh token over plain HTTP to non-loopback Keycloak at ${keycloakUrl}`
    );
  }
  const realm = `plexica-${ADMIN_TENANT_SLUG}`;
  // Bound the request so a non-responsive Keycloak cannot block the fixture
  // past its timeout window (CodeRabbit).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: 'plexica-web',
          refresh_token: refreshToken,
        }),
        signal: controller.signal,
        redirect: 'error',
      }
    );
    expect(response.ok, `token refresh failed: ${response.status}`).toBe(true);
    const tokens = (await response.json()) as { access_token: string };
    return tokens.access_token;
  } finally {
    clearTimeout(timer);
  }
}