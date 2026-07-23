import { expect } from 'vitest';

import { config } from '../lib/config.js';

export interface KeycloakClient extends Record<string, unknown> {
  id?: unknown;
  attributes?: unknown;
}

export async function getKeycloakAdminToken(): Promise<string> {
  const response = await fetch(
    `${config.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: config.KEYCLOAK_ADMIN_USER,
        password: config.KEYCLOAK_ADMIN_PASSWORD,
      }),
    }
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { access_token?: unknown };
  expect(typeof body.access_token).toBe('string');
  return body.access_token as string;
}

export async function readKeycloakClient(
  token: string,
  realm: string,
  clientId: string
): Promise<KeycloakClient> {
  const lookup = await fetch(
    `${config.KEYCLOAK_URL}/admin/realms/${realm}/clients?clientId=${clientId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(lookup.status).toBe(200);
  const matches = (await lookup.json()) as KeycloakClient[];
  expect(matches).toHaveLength(1);
  expect(typeof matches[0]?.id).toBe('string');
  const response = await fetch(
    `${config.KEYCLOAK_URL}/admin/realms/${realm}/clients/${String(matches[0]?.id)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(response.status).toBe(200);
  return (await response.json()) as KeycloakClient;
}

export async function readRealmRoleScopes(
  token: string,
  realm: string,
  client: KeycloakClient
): Promise<string[]> {
  const response = await fetch(
    `${config.KEYCLOAK_URL}/admin/realms/${realm}/clients/${String(client.id)}/scope-mappings/realm`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(response.status).toBe(200);
  const mappings = (await response.json()) as Array<{ name?: unknown }>;
  return mappings.map(({ name }) => String(name)).sort();
}

export async function readProtocolMappers(
  token: string,
  realm: string,
  client: KeycloakClient
): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(
    `${config.KEYCLOAK_URL}/admin/realms/${realm}/clients/${String(client.id)}/protocol-mappers/models`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Array<Record<string, unknown>>;
}

export async function readRealmSessionSettings(
  token: string,
  realm: string
): Promise<Record<string, unknown>> {
  const response = await fetch(`${config.KEYCLOAK_URL}/admin/realms/${realm}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

export async function requestAuthorizationError(
  realm: string,
  clientId: string,
  redirectUri: string,
  pkce?: { challenge: string; method: string }
): Promise<URL> {
  const url = new URL(`${config.KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid',
    state: 'security-smoke-state',
    ...(pkce === undefined
      ? {}
      : { code_challenge: pkce.challenge, code_challenge_method: pkce.method }),
  }).toString();
  const response = await fetch(url, { redirect: 'manual' });
  expect(response.status).toBe(302);
  const location = response.headers.get('Location');
  expect(location).not.toBeNull();
  return new URL(String(location));
}

export async function requestPasswordGrant(realm: string, clientId: string): Promise<Response> {
  return fetch(`${config.KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      username: config.KEYCLOAK_ADMIN_USER,
      password: config.KEYCLOAK_ADMIN_PASSWORD,
    }),
  });
}
