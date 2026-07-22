import { adminFetch, getKeycloakUrl } from './admin-api.js';

const CLIENT_ID = 'plexica-admin';
const ADMIN_ORIGIN = 'http://localhost:3002';
const ADMIN_CALLBACK = `${ADMIN_ORIGIN}/callback`;

interface ClientRepresentation extends Record<string, unknown> {
  id?: unknown;
  attributes?: unknown;
}

function desiredClient(existing: ClientRepresentation = {}): ClientRepresentation {
  const existingAttributes =
    typeof existing.attributes === 'object' && existing.attributes !== null
      ? (existing.attributes as Record<string, unknown>)
      : {};
  return {
    ...existing,
    clientId: CLIENT_ID,
    name: 'Plexica Admin App',
    enabled: true,
    protocol: 'openid-connect',
    publicClient: true,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    authorizationServicesEnabled: false,
    bearerOnly: false,
    redirectUris: [ADMIN_CALLBACK],
    webOrigins: [ADMIN_ORIGIN],
    attributes: {
      ...existingAttributes,
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': `${ADMIN_ORIGIN}/login`,
    },
  };
}

function assertExactArray(actual: unknown, expected: string, field: string): void {
  if (!Array.isArray(actual) || actual.length !== 1 || actual[0] !== expected) {
    throw new Error(`${CLIENT_ID} security check failed: ${field}=${JSON.stringify(actual)}`);
  }
}

export function assertPlexicaAdminConfiguration(actual: ClientRepresentation): void {
  const expected: Record<string, boolean> = {
    publicClient: true,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (actual[field] !== value) {
      throw new Error(`${CLIENT_ID} security check failed: ${field}=${String(actual[field])}`);
    }
  }
  assertExactArray(actual.redirectUris, ADMIN_CALLBACK, 'redirectUris');
  assertExactArray(actual.webOrigins, ADMIN_ORIGIN, 'webOrigins');
  const attributes = actual.attributes as Record<string, unknown> | undefined;
  if (attributes?.['pkce.code.challenge.method'] !== 'S256') {
    throw new Error(`${CLIENT_ID} security check failed: PKCE S256 is not required`);
  }
  if (attributes['post.logout.redirect.uris'] !== `${ADMIN_ORIGIN}/login`) {
    throw new Error(`${CLIENT_ID} security check failed: post-logout URI is incorrect`);
  }
}

export async function reconcilePlexicaAdminClient(token: string): Promise<void> {
  const lookupResponse = await adminFetch(
    token,
    `/admin/realms/master/clients?clientId=${CLIENT_ID}`,
    'GET'
  );
  if (!lookupResponse.ok) {
    throw new Error(`${CLIENT_ID} lookup failed: HTTP ${lookupResponse.status}`);
  }
  const matches = (await lookupResponse.json()) as ClientRepresentation[];
  if (matches.length > 1) throw new Error(`Multiple ${CLIENT_ID} clients exist in master realm`);

  let uuid: string;
  const existing = matches[0];
  if (existing === undefined) {
    const createResponse = await adminFetch(
      token,
      '/admin/realms/master/clients',
      'POST',
      desiredClient()
    );
    if (createResponse.status !== 201) {
      throw new Error(`${CLIENT_ID} creation failed: HTTP ${createResponse.status}`);
    }
    uuid = createResponse.headers.get('Location')?.split('/').pop() ?? '';
  } else {
    if (typeof existing.id !== 'string') throw new Error(`${CLIENT_ID} lookup returned no UUID`);
    uuid = existing.id;
    const currentResponse = await adminFetch(token, `/admin/realms/master/clients/${uuid}`, 'GET');
    if (!currentResponse.ok) {
      throw new Error(`${CLIENT_ID} read failed: HTTP ${currentResponse.status}`);
    }
    const current = (await currentResponse.json()) as ClientRepresentation;
    const updateResponse = await adminFetch(
      token,
      `/admin/realms/master/clients/${uuid}`,
      'PUT',
      desiredClient(current)
    );
    if (!updateResponse.ok) {
      throw new Error(`${CLIENT_ID} update failed: HTTP ${updateResponse.status}`);
    }
  }
  if (uuid === '') throw new Error(`${CLIENT_ID} reconciliation returned no UUID`);

  const verifyResponse = await adminFetch(token, `/admin/realms/master/clients/${uuid}`, 'GET');
  if (!verifyResponse.ok) {
    throw new Error(`${CLIENT_ID} verification read failed: HTTP ${verifyResponse.status}`);
  }
  assertPlexicaAdminConfiguration((await verifyResponse.json()) as ClientRepresentation);
}

export async function assertPlexicaAdminPasswordGrantRejected(): Promise<void> {
  const response = await fetch(`${getKeycloakUrl()}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      username: process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin',
      password: process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'changeme',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  if (response.status !== 400 || body.error !== 'unauthorized_client') {
    throw new Error(`${CLIENT_ID} password grant was not rejected as unauthorized_client`);
  }
}
