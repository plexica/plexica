// keycloak-client.ts
// Shared OIDC protocol client factory for browser-based Keycloak authentication.
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
import { generateCodeChallenge, generateCodeVerifier } from './pkce.js';
import { AUTH_ERROR_MESSAGES, requestTokens, revokeTokens } from './oidc-request.js';

import type { TokenResponse } from './types.js';

export interface KeycloakClientConfig {
  keycloakUrl: string;
  clientId: string;
  /** Default realm used when no explicit realm is passed. */
  defaultRealm?: string;
  requestTimeoutMs?: number;
}

function realmBase(keycloakUrl: string, realm: string): string {
  return `${keycloakUrl}/realms/${realm}/protocol/openid-connect`;
}

export function createKeycloakClient(config: KeycloakClientConfig) {
  const { keycloakUrl, clientId, defaultRealm, requestTimeoutMs } = config;

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
    getLoginUrl: async (realm: string, state: string, redirectUri: string): Promise<string> => {
      const codeVerifier = generateCodeVerifier();
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
      redirectUri: string
    ): Promise<TokenResponse> => {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      });

      return requestTokens(
        `${realmBase(keycloakUrl, realm)}/token`,
        body,
        AUTH_ERROR_MESSAGES.exchange,
        requestTimeoutMs
      );
    },

    /**
     * Silently refresh an access token using a refresh token.
     */
    refreshTokens: async (refreshToken: string, realm?: string): Promise<TokenResponse> => {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      });

      return requestTokens(
        `${realmBase(keycloakUrl, resolveRealm(realm))}/token`,
        body,
        AUTH_ERROR_MESSAGES.refresh,
        requestTimeoutMs
      );
    },

    /**
     * Build a Keycloak logout URL (front-channel logout via browser redirect).
     */
    getLogoutUrl: (realm: string, idToken: string, postLogoutRedirectUri?: string): string => {
      const params = new URLSearchParams({
        client_id: clientId,
        post_logout_redirect_uri: postLogoutRedirectUri ?? window.location.origin,
        id_token_hint: idToken,
      });
      return `${realmBase(keycloakUrl, realm)}/logout?${params.toString()}`;
    },

    /**
     * Backchannel logout — invalidates the Keycloak session server-side.
     */
    revokeSession: async (refreshToken: string, realm?: string): Promise<void> => {
      const body = new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
      });
      await revokeTokens(
        `${realmBase(keycloakUrl, resolveRealm(realm))}/logout`,
        body,
        requestTimeoutMs
      );
    },
  };
}

export type KeycloakClient = ReturnType<typeof createKeycloakClient>;
