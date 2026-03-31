// smoke-keycloak.test.ts
// Integration smoke test: Keycloak OIDC discovery and token exchange.
// Uses real Keycloak container — no mock tokens.

import { describe, expect, it } from 'vitest';

import { config } from '../lib/config.js';

const REALM = 'plexica-test';
const BASE_URL = config.KEYCLOAK_URL;
const CLIENT_ID = 'plexica-web';

describe('Keycloak smoke test', () => {
  it('OIDC discovery endpoint returns 200 with issuer field', async () => {
    const url = `${BASE_URL}/realms/${REALM}/.well-known/openid-configuration`;
    const res = await fetch(url);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(typeof body['issuer']).toBe('string');
    expect(body['issuer']).toContain(REALM);
  });

  it('token endpoint is discoverable and reachable', async () => {
    const discoveryUrl = `${BASE_URL}/realms/${REALM}/.well-known/openid-configuration`;
    const discoveryRes = await fetch(discoveryUrl);
    const discovery = await discoveryRes.json() as Record<string, unknown>;

    expect(typeof discovery['token_endpoint']).toBe('string');
    // Verify the token endpoint URL contains the realm
    expect(discovery['token_endpoint'] as string).toContain(REALM);
  });

  it('exchanges super-admin credentials for a real access token', async () => {
    const tokenUrl = `${BASE_URL}/realms/${REALM}/protocol/openid-connect/token`;
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      username: 'super-admin@plexica.test',
      password: 'test1234',
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body['access_token']).toBe('string');

    // Verify it is a JWT (3 parts separated by dots)
    const token = body['access_token'] as string;
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });
});
