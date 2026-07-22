// smoke-keycloak.test.ts
// Integration smoke test: Keycloak OIDC discovery and token exchange.
// Uses real Keycloak container — no mock tokens.

import { describe, expect, it } from 'vitest';

import { config } from '../lib/config.js';

const BASE_URL = config.KEYCLOAK_URL;
const ADMIN_USERNAME = config.KEYCLOAK_ADMIN_USER;
const ADMIN_PASSWORD = config.KEYCLOAK_ADMIN_PASSWORD;

async function getAdminToken(): Promise<string> {
  const response = await fetch(`${BASE_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { access_token?: unknown };
  expect(typeof body.access_token).toBe('string');
  return body.access_token as string;
}

describe('Keycloak smoke test', () => {
  it('OIDC discovery endpoint returns 200 with issuer field', async () => {
    const realm = 'plexica-test';
    const url = `${BASE_URL}/realms/${realm}/.well-known/openid-configuration`;
    const res = await fetch(url);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body['issuer']).toBe('string');
    expect(body['issuer']).toContain(realm);
  });

  it('token endpoint is discoverable and reachable', async () => {
    const realm = 'plexica-test';
    const discoveryUrl = `${BASE_URL}/realms/${realm}/.well-known/openid-configuration`;
    const discoveryRes = await fetch(discoveryUrl);
    const discovery = (await discoveryRes.json()) as Record<string, unknown>;

    expect(typeof discovery['token_endpoint']).toBe('string');
    // Verify the token endpoint URL contains the realm
    expect(discovery['token_endpoint'] as string).toContain(realm);
  });

  it('exchanges admin credentials for a real access token via admin-cli', async () => {
    // Uses admin-cli client (built-in, always has direct grant enabled)
    // against the master realm. This tests real Keycloak token exchange.
    // Browser clients no longer have directAccessGrantsEnabled (ADR-023).
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
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body['access_token']).toBe('string');

    // Verify it is a JWT (3 parts separated by dots)
    const token = body['access_token'] as string;
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('rejects password grant for the plexica-admin public client', async () => {
    const response = await fetch(`${BASE_URL}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'plexica-admin',
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'unauthorized_client' });
  });

  it('enforces exact redirect and PKCE S256 on plexica-admin', async () => {
    const token = await getAdminToken();
    const lookup = await fetch(`${BASE_URL}/admin/realms/master/clients?clientId=plexica-admin`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(lookup.status).toBe(200);
    const clients = (await lookup.json()) as Array<{ id?: unknown }>;
    expect(clients).toHaveLength(1);
    expect(typeof clients[0]?.id).toBe('string');

    const response = await fetch(
      `${BASE_URL}/admin/realms/master/clients/${String(clients[0]?.id)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(response.status).toBe(200);
    const client = (await response.json()) as Record<string, unknown>;
    expect(client).toMatchObject({
      publicClient: true,
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      redirectUris: ['http://localhost:3002/callback'],
      webOrigins: ['http://localhost:3002'],
    });
    expect(client['attributes']).toMatchObject({ 'pkce.code.challenge.method': 'S256' });
  });

  it('keeps the master realm access-token TTL production-like', async () => {
    const token = await getAdminToken();
    const response = await fetch(`${BASE_URL}/admin/realms/master`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ accessTokenLifespan: 300 });
  });

  it('removes the legacy fixed-secret e2e-api client', async () => {
    const token = await getAdminToken();
    const response = await fetch(`${BASE_URL}/admin/realms/master/clients?clientId=e2e-api`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });
});
