// session-token.ts
// Single source of truth for the tokens of a logged-in E2E session.
//
// The Zustand auth store persists `{ accessToken, refreshToken, realm }` under
// the `plexica-auth` sessionStorage key (packages/auth/src/auth-store.ts
// partializeAuthState + apps/web/src/stores/auth-store.ts partialize). This
// module is the ONE place that knows that shape: the same
// `page.evaluate(() => sessionStorage.getItem('plexica-auth'))` snippet used to
// be copy-pasted into helpers/workspace-members.ts and workspace-crud.spec.ts,
// so a storage-key change broke them one by one.
//
// WHY freshAccessToken() EXISTS: tenant realms issue 60-second access tokens
// (lib/keycloak-admin-helpers.ts `accessTokenLifespan: 60`) and the web app does
// NOT refresh on a timer — useSilentRefresh only reacts to an unauthenticated
// state and api-client only refreshes after a 401. A token read out of
// sessionStorage is therefore up to a minute old, and a direct
// `page.request.*` call made with it late in a test answers 401. Minting a new
// one from the (30-minute) refresh token immediately before the call removes
// that race instead of hoping the test stays under a minute.

import { KEYCLOAK_URL } from './keycloak-login.js';

import type { Page } from '@playwright/test';

/** Public browser client of every realm (lib/keycloak-tenant-client.ts). */
const WEB_CLIENT_ID = 'plexica-web';

type PersistedField = 'accessToken' | 'refreshToken' | 'realm';

interface PersistedAuth {
  state?: Partial<Record<PersistedField, string>>;
}

async function readAuthField(page: Page, field: PersistedField): Promise<string> {
  return page.evaluate((key: PersistedField) => {
    const stored = sessionStorage.getItem('plexica-auth');
    if (stored === null) return '';
    const parsed = JSON.parse(stored) as PersistedAuth;
    return parsed.state?.[key] ?? '';
  }, field);
}

/** Access token currently held by the session, or '' when absent. */
export function readAccessToken(page: Page): Promise<string> {
  return readAuthField(page, 'accessToken');
}

/** Refresh token currently held by the session, or '' when absent. */
export function readRefreshToken(page: Page): Promise<string> {
  return readAuthField(page, 'refreshToken');
}

/** Keycloak realm the session authenticated against (e.g. `plexica-e2e`). */
export function readRealm(page: Page): Promise<string> {
  return readAuthField(page, 'realm');
}

/**
 * Exchanges a refresh token for a brand-new access token.
 *
 * `plexica-web` is a public client, so the refresh grant needs no client secret,
 * and it is NOT gated by `directAccessGrantsEnabled` (false since ADR-023 — the
 * password grant is unavailable, this one is not). Realms keep the Keycloak
 * default `revokeRefreshToken: false`, so minting here does not invalidate the
 * refresh token the browser page still holds.
 */
export async function mintAccessToken(realm: string, refreshToken: string): Promise<string> {
  const response = await fetch(`${KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: WEB_CLIENT_ID,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Refresh grant failed in realm ${realm}: HTTP ${String(response.status)}`);
  }
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string') {
    throw new Error(`Refresh grant in realm ${realm} returned no access_token`);
  }
  return body.access_token;
}

/** Mints a token that is valid *now* for the session logged in on `page`. */
export async function freshAccessToken(page: Page): Promise<string> {
  const [realm, refreshToken] = await Promise.all([readRealm(page), readRefreshToken(page)]);
  if (realm === '' || refreshToken === '') {
    throw new Error('No persisted session on this page — log in before requesting a token');
  }
  return mintAccessToken(realm, refreshToken);
}

/** `Authorization` (+ JSON content type) headers for a direct API call. */
export function bearer(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/** Shorthand: freshly minted bearer headers for the session on `page`. */
export async function freshBearer(page: Page): Promise<Record<string, string>> {
  return bearer(await freshAccessToken(page));
}
