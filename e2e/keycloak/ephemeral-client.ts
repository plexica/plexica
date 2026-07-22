import { randomBytes, randomUUID } from 'node:crypto';

import { adminFetch, assertExplicitLoopbackE2eTarget, getKeycloakUrl } from './admin-api.js';

import type { KeycloakRole } from './realm-role.js';

export const E2E_CLIENT_ID_ENV = 'PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_ID';
export const E2E_CLIENT_SECRET_ENV = 'PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_SECRET';
export const E2E_CLIENT_UUID_ENV = 'PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_UUID';

interface EphemeralClient {
  uuid: string;
  clientId: string;
  secret: string;
}

function publishClient(client: EphemeralClient): void {
  process.env[E2E_CLIENT_UUID_ENV] = client.uuid;
  process.env[E2E_CLIENT_ID_ENV] = client.clientId;
  process.env[E2E_CLIENT_SECRET_ENV] = client.secret;
}

function clearClientEnvironment(): void {
  delete process.env[E2E_CLIENT_UUID_ENV];
  delete process.env[E2E_CLIENT_ID_ENV];
  delete process.env[E2E_CLIENT_SECRET_ENV];
}

async function deleteLegacyE2eApiClient(token: string): Promise<void> {
  const lookup = await adminFetch(token, '/admin/realms/master/clients?clientId=e2e-api', 'GET');
  if (!lookup.ok) throw new Error(`Legacy e2e-api lookup failed: HTTP ${lookup.status}`);
  const clients = (await lookup.json()) as Array<{ id?: unknown }>;
  for (const client of clients) {
    if (typeof client.id !== 'string') throw new Error('Legacy e2e-api lookup returned no UUID');
    const response = await adminFetch(token, `/admin/realms/master/clients/${client.id}`, 'DELETE');
    if (!response.ok && response.status !== 404) {
      throw new Error(`Legacy e2e-api deletion failed: HTTP ${response.status}`);
    }
  }
}

async function assertClientConfiguration(token: string, client: EphemeralClient): Promise<void> {
  const response = await adminFetch(token, `/admin/realms/master/clients/${client.uuid}`, 'GET');
  if (!response.ok) throw new Error(`Ephemeral client read-back failed: HTTP ${response.status}`);
  const actual = (await response.json()) as Record<string, unknown>;
  const expected: Record<string, unknown> = {
    clientId: client.clientId,
    publicClient: false,
    standardFlowEnabled: false,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: true,
    serviceAccountsEnabled: false,
    fullScopeAllowed: false,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (actual[field] !== value) {
      throw new Error(`Ephemeral client security check failed: ${field}=${String(actual[field])}`);
    }
  }

  const mappingsResponse = await adminFetch(
    token,
    `/admin/realms/master/clients/${client.uuid}/scope-mappings/realm`,
    'GET'
  );
  if (!mappingsResponse.ok) {
    throw new Error(
      `Ephemeral client role-scope read-back failed: HTTP ${mappingsResponse.status}`
    );
  }
  const mappings = (await mappingsResponse.json()) as Array<{ name?: unknown }>;
  const names = mappings.map(({ name }) => name).sort();
  if (names.length !== 1 || names[0] !== 'super_admin') {
    throw new Error(`Ephemeral client has unexpected realm role scopes: ${JSON.stringify(names)}`);
  }
}

export async function createEphemeralE2eClient(
  token: string,
  suite: 'admin' | 'web',
  superAdminRole: KeycloakRole
): Promise<void> {
  assertExplicitLoopbackE2eTarget();
  await deleteLegacyE2eApiClient(token);
  const client: EphemeralClient = {
    uuid: '',
    clientId: `plexica-playwright-${suite}-${randomUUID()}`,
    secret: randomBytes(32).toString('base64url'),
  };
  const createResponse = await adminFetch(token, '/admin/realms/master/clients', 'POST', {
    clientId: client.clientId,
    name: `Plexica ${suite} E2E ephemeral API client`,
    protocol: 'openid-connect',
    secret: client.secret,
    enabled: true,
    publicClient: false,
    standardFlowEnabled: false,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: true,
    serviceAccountsEnabled: false,
    authorizationServicesEnabled: false,
    fullScopeAllowed: false,
  });
  if (createResponse.status !== 201) {
    throw new Error(`Ephemeral E2E client creation failed: HTTP ${createResponse.status}`);
  }
  client.uuid = createResponse.headers.get('Location')?.split('/').pop() ?? '';
  if (client.uuid === '') {
    throw new Error('Ephemeral E2E client creation returned no client UUID');
  }
  publishClient(client);

  try {
    const scopeResponse = await adminFetch(
      token,
      `/admin/realms/master/clients/${client.uuid}/scope-mappings/realm`,
      'POST',
      [superAdminRole]
    );
    if (!scopeResponse.ok) {
      throw new Error(`Ephemeral E2E role scope mapping failed: HTTP ${scopeResponse.status}`);
    }
    await assertClientConfiguration(token, client);
    const accessToken = await getE2eApiToken();
    assertTokenRoleScope(accessToken);
  } catch (error) {
    await deleteEphemeralE2eClient(token);
    throw error;
  }
}

export async function getE2eApiToken(): Promise<string> {
  assertExplicitLoopbackE2eTarget();
  const clientId = process.env[E2E_CLIENT_ID_ENV];
  const clientSecret = process.env[E2E_CLIENT_SECRET_ENV];
  if (clientId === undefined || clientSecret === undefined) {
    throw new Error(
      `Missing ephemeral Keycloak credentials (${E2E_CLIENT_ID_ENV}/${E2E_CLIENT_SECRET_ENV})`
    );
  }
  const response = await fetch(`${getKeycloakUrl()}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username: process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin',
      password: process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      `Ephemeral E2E token fetch failed: ${response.status} ${await response.text()}`
    );
  }
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string') {
    throw new Error('Ephemeral E2E token response did not contain an access_token');
  }
  assertTokenRoleScope(body.access_token);
  return body.access_token;
}

function assertTokenRoleScope(token: string): void {
  const encodedPayload = token.split('.')[1];
  if (encodedPayload === undefined) throw new Error('Ephemeral client returned a malformed JWT');
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
    realm_access?: { roles?: unknown };
  };
  const roles = payload.realm_access?.roles;
  if (!Array.isArray(roles) || roles.length !== 1 || roles[0] !== 'super_admin') {
    throw new Error(`Ephemeral client token has unexpected realm roles: ${JSON.stringify(roles)}`);
  }
}

export async function deleteEphemeralE2eClient(token: string): Promise<void> {
  assertExplicitLoopbackE2eTarget();
  const uuid = process.env[E2E_CLIENT_UUID_ENV];
  if (uuid === undefined) return;
  const response = await adminFetch(token, `/admin/realms/master/clients/${uuid}`, 'DELETE');
  if (!response.ok && response.status !== 404) {
    throw new Error(`Ephemeral E2E client deletion failed: HTTP ${response.status}`);
  }
  clearClientEnvironment();
}
