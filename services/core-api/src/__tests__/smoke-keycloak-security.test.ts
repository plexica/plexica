import { describe, expect, it } from 'vitest';

import {
  getKeycloakAdminToken,
  readKeycloakClient,
  readRealmRoleScopes,
  readProtocolMappers,
  readRealmSessionSettings,
  requestAuthorizationError,
  requestPasswordGrant,
} from './keycloak-test-helpers.js';

const CLIENTS = [
  {
    realm: 'master',
    clientId: 'plexica-admin',
    callback: 'http://localhost:3002/callback',
    logout: 'http://localhost:3002/login',
    origin: 'http://localhost:3002',
    scopes: ['super_admin'],
  },
  {
    realm: 'plexica-test',
    clientId: 'plexica-web',
    callback: 'http://localhost:3000/callback',
    logout: 'http://localhost:3000/?tenant=test',
    origin: 'http://localhost:3000',
    scopes: ['member', 'tenant_admin'],
  },
] as const;

describe('Keycloak browser-client security', () => {
  it('caps all privileged master-realm sessions without changing tenant realms', async () => {
    const token = await getKeycloakAdminToken();
    const master = await readRealmSessionSettings(token, 'master');
    expect(Number(master['ssoSessionIdleTimeout'])).toBeGreaterThan(0);
    expect(Number(master['ssoSessionIdleTimeout'])).toBeLessThanOrEqual(3600);
    expect(Number(master['ssoSessionMaxLifespan'])).toBeGreaterThan(0);
    expect(Number(master['ssoSessionMaxLifespan'])).toBeLessThanOrEqual(3600);

    const tenant = await readRealmSessionSettings(token, 'plexica-test');
    expect(tenant['ssoSessionIdleTimeout']).toBe(1800);
    expect(tenant['ssoSessionMaxLifespan']).toBe(36000);
  });

  it.each(CLIENTS)('enforces exact least-privilege settings for $clientId', async (expected) => {
    const token = await getKeycloakAdminToken();
    const client = await readKeycloakClient(token, expected.realm, expected.clientId);
    expect(client).toMatchObject({
      publicClient: true,
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      fullScopeAllowed: false,
      redirectUris: [expected.callback],
      webOrigins: [expected.origin],
    });
    expect(client.attributes).toMatchObject({
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': expected.logout,
    });
    const attributes = client.attributes as Record<string, unknown>;
    if (expected.clientId === 'plexica-admin') {
      expect(Number(attributes['client.session.idle.timeout'])).toBeGreaterThan(0);
      expect(Number(attributes['client.session.idle.timeout'])).toBeLessThanOrEqual(3600);
      expect(Number(attributes['client.session.max.lifespan'])).toBeGreaterThan(0);
      expect(Number(attributes['client.session.max.lifespan'])).toBeLessThanOrEqual(3600);
    } else {
      expect(attributes).not.toHaveProperty('client.session.idle.timeout');
      expect(attributes).not.toHaveProperty('client.session.max.lifespan');
    }
    await expect(readRealmRoleScopes(token, expected.realm, client)).resolves.toEqual(
      expected.scopes
    );
    const mappers = await readProtocolMappers(token, expected.realm, client);
    expect(mappers).toContainEqual(
      expect.objectContaining({
        name: 'audience-mapper',
        config: expect.objectContaining({
          'included.client.audience': 'plexica-api',
          'access.token.claim': 'true',
        }),
      })
    );
  });

  it.each(CLIENTS)('rejects authorization without PKCE for $clientId', async (client) => {
    const result = await requestAuthorizationError(client.realm, client.clientId, client.callback);
    expect(result.origin + result.pathname).toBe(client.callback);
    expect(result.searchParams.get('error')).toBe('invalid_request');
    expect(result.searchParams.get('state')).toBe('security-smoke-state');
  });

  it.each(CLIENTS)('rejects plain PKCE for $clientId', async (client) => {
    const result = await requestAuthorizationError(client.realm, client.clientId, client.callback, {
      challenge: 'plain-challenge-must-be-rejected',
      method: 'plain',
    });
    expect(result.origin + result.pathname).toBe(client.callback);
    expect(result.searchParams.get('error')).toBe('invalid_request');
  });

  it.each(CLIENTS)('rejects direct password grants for $clientId', async (client) => {
    const response = await requestPasswordGrant(client.realm, client.clientId);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'unauthorized_client' });
  });
});
