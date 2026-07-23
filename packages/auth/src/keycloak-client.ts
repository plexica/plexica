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
import { storeAuthorizationRequest } from './authorization-request.js';
import { verifyIdToken } from './id-token.js';
import { generateCodeChallenge, generateCodeVerifier } from './pkce.js';
import {
  AUTH_ERROR_MESSAGES,
  AuthRequestError,
  requestTokens,
  revokeTokens,
} from './oidc-request.js';

import type { TokenResponse } from './types.js';

export interface KeycloakClientConfig {
  keycloakUrl: string;
  clientId: string;
  /** Default realm used when no explicit realm is passed. */
  defaultRealm?: string;
  requestTimeoutMs?: number;
  revokeTimeoutMs?: number;
}

function realmBase(keycloakUrl: string, realm: string): string {
  return `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect`;
}

function realmIssuer(keycloakUrl: string, realm: string): string {
  return `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}`;
}

export function createKeycloakClient(config: KeycloakClientConfig) {
  const { keycloakUrl, clientId, defaultRealm, requestTimeoutMs, revokeTimeoutMs = 2_000 } = config;

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
      const nonce = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      storeAuthorizationRequest(state, { codeVerifier, nonce });

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid profile email',
        state,
        nonce,
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
      nonce: string
    ): Promise<TokenResponse> => {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      });

      const tokens = await requestTokens(
        `${realmBase(keycloakUrl, realm)}/token`,
        body,
        AUTH_ERROR_MESSAGES.exchange,
        requestTimeoutMs
      );
      if (tokens.id_token === undefined) {
        throw new AuthRequestError(AUTH_ERROR_MESSAGES.exchange);
      }
      try {
        await verifyIdToken(tokens.id_token, {
          issuer: realmIssuer(keycloakUrl, realm),
          audience: clientId,
          nonce,
          timeoutMs: requestTimeoutMs,
        });
      } catch {
        throw new AuthRequestError(AUTH_ERROR_MESSAGES.exchange);
      }
      return tokens;
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

      const tokens = await requestTokens(
        `${realmBase(keycloakUrl, resolveRealm(realm))}/token`,
        body,
        AUTH_ERROR_MESSAGES.refresh,
        requestTimeoutMs
      );
      if (tokens.id_token !== undefined) {
        try {
          await verifyIdToken(tokens.id_token, {
            issuer: realmIssuer(keycloakUrl, resolveRealm(realm)),
            audience: clientId,
            timeoutMs: requestTimeoutMs,
          });
        } catch {
          throw new AuthRequestError(AUTH_ERROR_MESSAGES.refresh);
        }
      }
      return tokens;
    },

    /**
     * Build a Keycloak logout URL (front-channel logout via browser redirect).
     */
    getLogoutUrl: (
      realm: string,
      idToken: string | null,
      postLogoutRedirectUri: string
    ): string => {
      const params = new URLSearchParams({
        client_id: clientId,
        post_logout_redirect_uri: postLogoutRedirectUri,
      });
      if (idToken !== null) params.set('id_token_hint', idToken);
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
        revokeTimeoutMs
      );
    },
  };
}

export type KeycloakClient = ReturnType<typeof createKeycloakClient>;
