import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createKeycloakClient } from '../src/keycloak-client.js';
import { AUTH_ERROR_MESSAGES, AuthRequestError } from '../src/oidc-request.js';
import {
  createAuthorizationState,
  generateCodeChallenge,
  generateCodeVerifier,
} from '../src/pkce.js';

import { MemoryStorage, tokenResponse } from './test-helpers.js';

describe('PKCE and Keycloak client', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    vi.stubGlobal('window', { location: { origin: 'https://app.example.com' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should generate valid random state and verifier values', () => {
    const state = createAuthorizationState();
    const verifier = generateCodeVerifier();

    expect(state).toMatch(/^[0-9a-f-]{36}$/i);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(generateCodeVerifier()).not.toBe(verifier);
  });

  it('should generate the RFC 7636 S256 challenge', async () => {
    await expect(
      generateCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('should preserve state and store the verifier in the authorization request', async () => {
    const client = createKeycloakClient({
      keycloakUrl: 'https://id.example.com',
      clientId: 'browser-client',
    });
    const url = new URL(
      await client.getLoginUrl('tenant-realm', 'csrf-state', 'https://app.example.com/callback')
    );

    expect(url.searchParams.get('state')).toBe('csrf-state');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(sessionStorage.getItem('pkce_code_verifier')).toMatch(/^[A-Za-z0-9_-]{86}$/);
  });

  it('should return a safe stable error for token endpoint failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('secret endpoint detail', {
          status: 400,
        })
      )
    );
    const client = createKeycloakClient({ keycloakUrl: 'https://id.example.com', clientId: 'app' });

    await expect(
      client.exchangeCode('code', 'realm', 'verifier', 'https://app/callback')
    ).rejects.toEqual(new AuthRequestError(AUTH_ERROR_MESSAGES.exchange));
  });

  it('should reject non-successful revocation with a safe stable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const client = createKeycloakClient({ keycloakUrl: 'https://id.example.com', clientId: 'app' });

    await expect(client.revokeSession('refresh', 'realm')).rejects.toThrow(
      AUTH_ERROR_MESSAGES.revoke
    );
  });

  it('should build an RP-initiated logout URL with exact redirect and ID token hint', () => {
    const client = createKeycloakClient({ keycloakUrl: 'https://id.example.com', clientId: 'app' });
    const url = new URL(
      client.getLogoutUrl('realm', 'id-token', 'https://app.example.com/?tenant=acme')
    );

    expect(url.searchParams.get('id_token_hint')).toBe('id-token');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      'https://app.example.com/?tenant=acme'
    );
  });

  it('should apply an abort timeout and hide network errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('timed out', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);
    const client = createKeycloakClient({
      keycloakUrl: 'https://id.example.com',
      clientId: 'app',
      requestTimeoutMs: 5,
    });

    await expect(client.refreshTokens('refresh', 'realm')).rejects.toThrow(
      AUTH_ERROR_MESSAGES.refresh
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it('should parse a valid token response without requiring an ID token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(tokenResponse())));
    const client = createKeycloakClient({ keycloakUrl: 'https://id.example.com', clientId: 'app' });

    await expect(client.refreshTokens('refresh', 'realm')).resolves.toMatchObject({
      access_token: expect.any(String),
      refresh_token: 'refresh-new',
    });
  });
});
