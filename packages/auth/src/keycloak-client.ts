// keycloak-client.ts
// Shared OIDC protocol client factory for Keycloak authentication.
// Creates a configured client with PKCE and/or password-grant capabilities.
//
// Usage:
//   const kc = createKeycloakClient({
//     keycloakUrl: 'http://localhost:8080',
//     clientId: 'plexica-admin',
//     defaultRealm: 'master',
//   });
//
//   // PKCE flow
//   const url = await kc.getLoginUrl('master', crypto.randomUUID());
//
//   // Password grant (admin app, E2E tests)
//   const tokens = await kc.loginWithPassword('admin', 'changeme');

import type { TokenResponse } from './types.js';

export interface KeycloakClientConfig {
  keycloakUrl: string;
  clientId: string;
  /** Default realm used when no explicit realm is passed. */
  defaultRealm?: string;
}

function realmBase(keycloakUrl: string, realm: string): string {
  return `${keycloakUrl}/realms/${realm}/protocol/openid-connect`;
}

/**
 * Generate a cryptographically secure random string for PKCE.
 */
async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a PKCE code challenge (S256) from a verifier.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function createKeycloakClient(config: KeycloakClientConfig) {
  const { keycloakUrl, clientId, defaultRealm } = config;

  const resolveRealm = (realm?: string): string => realm ?? defaultRealm ?? 'master';

  return {
    clientId,
    defaultRealm: resolveRealm(),

    /** Build the OIDC endpoint base URL for a given realm. */
    realmBase: (realm?: string): string => {
      return realmBase(keycloakUrl, resolveRealm(realm));
    },

    /**
     * Build a Keycloak PKCE authorization URL.
     * Stores the PKCE code verifier in sessionStorage for retrieval by
     * exchangeCode().
     */
    getLoginUrl: async (
      realm: string,
      state: string,
      redirectUri: string,
    ): Promise<string> => {
      const codeVerifier = await generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      sessionStorage.setItem('pkce_code_verifier', codeVerifier);

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid profile email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      return `${realmBase(keycloakUrl, realm)}/auth?${params.toString()}`;
    },

    /**
     * Exchange an authorization code for tokens (PKCE callback).
     */
    exchangeCode: async (
      code: string,
      realm: string,
      codeVerifier: string,
      redirectUri: string,
    ): Promise<TokenResponse> => {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      });

      const response = await fetch(`${realmBase(keycloakUrl, realm)}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.status}`);
      }

      return response.json() as Promise<TokenResponse>;
    },

    /**
     * Direct password grant — exchanges username + password for tokens.
     * Intended for internal tooling (admin app) and E2E tests.
     */
    loginWithPassword: async (
      username: string,
      password: string,
      realm?: string,
    ): Promise<TokenResponse> => {
      const body = new URLSearchParams({
        grant_type: 'password',
        client_id: clientId,
        username,
        password,
        scope: 'openid profile email',
      });

      const response = await fetch(
        `${realmBase(keycloakUrl, resolveRealm(realm))}/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        },
      );

      if (!response.ok) {
        throw new Error(`Login failed: ${response.status}`);
      }

      return response.json() as Promise<TokenResponse>;
    },

    /**
     * Silently refresh an access token using a refresh token.
     */
    refreshTokens: async (
      refreshToken: string,
      realm?: string,
    ): Promise<TokenResponse> => {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      });

      const response = await fetch(
        `${realmBase(keycloakUrl, resolveRealm(realm))}/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        },
      );

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      return response.json() as Promise<TokenResponse>;
    },

    /**
     * Build a Keycloak logout URL (front-channel logout via browser redirect).
     */
    getLogoutUrl: (
      realm: string,
      idToken: string,
      postLogoutRedirectUri?: string,
    ): string => {
      const params = new URLSearchParams({
        client_id: clientId,
        post_logout_redirect_uri: postLogoutRedirectUri ?? window.location.origin,
        id_token_hint: idToken,
      });
      return `${realmBase(keycloakUrl, realm)}/logout?${params.toString()}`;
    },

    /**
     * Backchannel logout — invalidates the Keycloak session server-side
     * via a direct POST request (no browser redirect required).
     * Best-effort: errors are swallowed so local state is always cleared.
     */
    revokeSession: async (
      refreshToken: string,
      realm?: string,
    ): Promise<void> => {
      const body = new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
      });
      await fetch(
        `${realmBase(keycloakUrl, resolveRealm(realm))}/logout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        },
      ).catch(() => {
        // Ignore network errors — local state will be cleared regardless.
      });
    },
  };
}

export type KeycloakClient = ReturnType<typeof createKeycloakClient>;
