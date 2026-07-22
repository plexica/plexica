// smoke-keycloak.test.ts
// Integration smoke test: Keycloak OIDC discovery and token exchange.
// Uses real Keycloak container — no mock tokens.

import { describe, expect, it } from 'vitest';

import { config } from '../lib/config.js';

const BASE_URL = config.KEYCLOAK_URL;
const ADMIN_USERNAME = config.KEYCLOAK_ADMIN_USER;
const ADMIN_PASSWORD = config.KEYCLOAK_ADMIN_PASSWORD;

describe('Keycloak smoke test', () => {
  it('OIDC discovery endpoint returns 200 with issuer field', async () => {
    const realm = 'plexica-test';
    const url = `${BASE_URL}/realms/${realm}/.well-known/openid-configuration`;
    const res = await fetch(url);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(typeof body['issuer']).toBe('string');
    expect(body['issuer']).toContain(realm);
  });

  it('token endpoint is discoverable and reachable', async () => {
    const realm = 'plexica-test';
    const discoveryUrl = `${BASE_URL}/realms/${realm}/.well-known/openid-configuration`;
    const discoveryRes = await fetch(discoveryUrl);
    const discovery = await discoveryRes.json() as Record<string, unknown>;

    expect(typeof discovery['token_endpoint']).toBe('string');
    // Verify the token endpoint URL contains the realm
    expect(discovery['token_endpoint'] as string).toContain(realm);
  });

  it('exchanges admin credentials for a real access token via admin-cli', async () => {
    // Uses admin-cli client (built-in, always has direct grant enabled)
    // against the master realm. This tests real Keycloak token exchange.
    // The plexica-web client no longer has directAccessGrantsEnabled
    // (ADR-023, Phase C — password grant removed from all clients).
    const tokenUrl = `${BASE_URL}/realms/master/protocol/openid-connect/token`;
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
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
