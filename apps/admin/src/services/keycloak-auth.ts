// keycloak-auth.ts
// Direct password-grant client for the Keycloak master realm.
// The admin app is an internal tool — no PKCE browser flow is used.
// Client `plexica-admin` must have "Direct Access Grants Enabled" in Keycloak.

import type { TokenResponse } from '../types/auth.js';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080';
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_ADMIN_CLIENT_ID ?? 'plexica-admin';
// Admin authenticates against the master realm, never a tenant realm.
const MASTER_REALM = import.meta.env.VITE_KEYCLOAK_MASTER_REALM ?? 'master';

function realmBase(realm: string): string {
  return `${KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect`;
}

export function getMasterRealm(): string {
  return MASTER_REALM;
}

/**
 * Direct password grant — exchanges username + password for tokens.
 * Used by the admin login form (internal tool, no browser redirect flow).
 */
export async function loginWithPassword(
  username: string,
  password: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    username,
    password,
    scope: 'openid profile email',
  });

  const response = await fetch(`${realmBase(MASTER_REALM)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Admin login failed: ${response.status}`);
  }

  return response.json() as Promise<TokenResponse>;
}

export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });

  const response = await fetch(`${realmBase(MASTER_REALM)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/**
 * Backchannel logout — invalidates the Keycloak session server-side.
 * Best-effort: network errors are swallowed so local state is always cleared.
 */
export async function revokeSession(refreshToken: string): Promise<void> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });
  await fetch(`${realmBase(MASTER_REALM)}/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }).catch(() => {
    // Ignore network errors — local state will be cleared regardless.
  });
}
