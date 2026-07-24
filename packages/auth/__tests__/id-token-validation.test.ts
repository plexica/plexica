import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearIdTokenJwksCache } from '../src/id-token.js';
import { createKeycloakClient } from '../src/keycloak-client.js';
import { AUTH_ERROR_MESSAGES, AuthRequestError } from '../src/oidc-request.js';

import { createIdTokenSigner, tokenResponse } from './test-helpers.js';

import type { JWK } from 'jose';

function mockTokenEndpoint(idToken: string, jwk: JWK): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const response = String(input).endsWith('/certs')
      ? Response.json({ keys: [jwk] })
      : Response.json(tokenResponse(idToken));
    return Promise.resolve(response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ID token validation', () => {
  afterEach(() => {
    clearIdTokenJwksCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should verify a signed token and reuse the cached realm JWKS', async () => {
    const signer = await createIdTokenSigner();
    const idToken = await signer.sign();
    const fetchMock = mockTokenEndpoint(idToken, signer.jwk);
    const client = createKeycloakClient({ keycloakUrl: 'https://id.example.com', clientId: 'app' });

    await expect(
      client.exchangeCode('code', 'realm', 'verifier', 'https://app/callback', 'expected-nonce')
    ).resolves.toMatchObject({ id_token: idToken });
    await client.exchangeCode(
      'code-2',
      'realm',
      'verifier',
      'https://app/callback',
      'expected-nonce'
    );

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/certs'))).toHaveLength(1);
  });

  it('should reject invalid ID token claims', async () => {
    const invalidClaims = [
      { nonce: 'wrong-nonce' },
      { audience: 'other-client' },
      { azp: 'other-client' },
      { expiresAt: 1 },
      { issuedAt: Math.floor(Date.now() / 1_000) + 300 },
    ];
    for (const [index, claims] of invalidClaims.entries()) {
      const realm = `realm-${index}`;
      const issuer = `https://id.example.com/realms/${realm}`;
      const signer = await createIdTokenSigner();
      const idToken = await signer.sign({ ...claims, issuer });
      mockTokenEndpoint(idToken, signer.jwk);
      const client = createKeycloakClient({
        keycloakUrl: 'https://id.example.com',
        clientId: 'app',
      });

      await expect(
        client.exchangeCode('code', realm, 'verifier', 'https://app/callback', 'expected-nonce')
      ).rejects.toEqual(new AuthRequestError(AUTH_ERROR_MESSAGES.exchange));
    }
  });

  it('should reject an ID token with a malformed signature', async () => {
    const trustedSigner = await createIdTokenSigner('shared-kid');
    const attackerSigner = await createIdTokenSigner('shared-kid');
    const idToken = await attackerSigner.sign();
    mockTokenEndpoint(idToken, trustedSigner.jwk);
    const client = createKeycloakClient({ keycloakUrl: 'https://id.example.com', clientId: 'app' });

    await expect(
      client.exchangeCode('code', 'realm', 'verifier', 'https://app/callback', 'expected-nonce')
    ).rejects.toEqual(new AuthRequestError(AUTH_ERROR_MESSAGES.exchange));
  });

  it('should reject a signed token from another issuer', async () => {
    const signer = await createIdTokenSigner();
    const idToken = await signer.sign({ issuer: 'https://other.example.com/realms/realm' });
    mockTokenEndpoint(idToken, signer.jwk);
    const client = createKeycloakClient({ keycloakUrl: 'https://id.example.com', clientId: 'app' });

    await expect(
      client.exchangeCode('code', 'realm', 'verifier', 'https://app/callback', 'expected-nonce')
    ).rejects.toEqual(new AuthRequestError(AUTH_ERROR_MESSAGES.exchange));
  });
});
