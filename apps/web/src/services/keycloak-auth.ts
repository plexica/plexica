// keycloak-auth.ts
// OIDC protocol client for Keycloak authentication.
// Implements PKCE flow for secure public client authentication.

import type { TokenResponse } from '../types/auth.js';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080';
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'plexica-web';
const REDIRECT_URI = `${window.location.origin}/callback`;

function realmBase(realm: string): string {
  return `${KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect`;
}

// Generate a cryptographically secure random string for PKCE
async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function getLoginUrl(realm: string, state: string): Promise<string> {
  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store verifier in sessionStorage for the callback
  sessionStorage.setItem('pkce_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${realmBase(realm)}/auth?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  realm: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const response = await fetch(`${realmBase(realm)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json() as Promise<TokenResponse>;
}

export async function refreshTokens(refreshToken: string, realm: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });

  const response = await fetch(`${realmBase(realm)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json() as Promise<TokenResponse>;
}

export function getLogoutUrl(
  realm: string,
  idToken: string,
  postLogoutRedirectUri?: string
): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: postLogoutRedirectUri ?? window.location.origin,
    id_token_hint: idToken,
  });
  return `${realmBase(realm)}/logout?${params.toString()}`;
}

/**
 * Backchannel logout: invalidates the Keycloak session server-side via a
 * direct POST request (no browser redirect required). Best-effort — errors
 * are swallowed so that local state is always cleared even if Keycloak is
 * temporarily unreachable.
 */
export async function revokeSession(realm: string, refreshToken: string): Promise<void> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });
  await fetch(`${realmBase(realm)}/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }).catch(() => {
    // Ignore network errors — local state will be cleared regardless
  });
}
