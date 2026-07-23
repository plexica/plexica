import { adminRequest } from './keycloak-admin-internal.js';
import { reconcileApiAudienceMapper } from './keycloak-audience.js';
import { buildClientPayload, buildTenantWebClientUris } from './keycloak-admin-helpers.js';

const CLIENT_ID = 'plexica-web';
const TENANT_ROLES = ['member', 'tenant_admin'] as const;

interface KeycloakClient extends Record<string, unknown> {
  id?: unknown;
  attributes?: unknown;
}

interface KeycloakRole {
  id: string;
  name: string;
}

async function readClient(realm: string, uuid: string): Promise<KeycloakClient> {
  const response = await adminRequest(`/admin/realms/${realm}/clients/${uuid}`, 'GET');
  if (!response.ok) throw new Error(`Failed to read ${CLIENT_ID} in ${realm}: ${response.status}`);
  return (await response.json()) as KeycloakClient;
}

async function resolveClientUuid(realm: string): Promise<string | null> {
  const response = await adminRequest(
    `/admin/realms/${realm}/clients?clientId=${encodeURIComponent(CLIENT_ID)}`,
    'GET'
  );
  if (!response.ok) throw new Error(`Failed to find ${CLIENT_ID} in ${realm}: ${response.status}`);
  const matches = (await response.json()) as KeycloakClient[];
  if (matches.length > 1) throw new Error(`Multiple ${CLIENT_ID} clients exist in ${realm}`);
  const id = matches[0]?.id;
  if (id === undefined) return null;
  if (typeof id !== 'string') throw new Error(`${CLIENT_ID} in ${realm} has no UUID`);
  return id;
}

async function upsertClient(realm: string, tenantSlug: string): Promise<string> {
  const desired = buildClientPayload(CLIENT_ID, tenantSlug);
  let uuid = await resolveClientUuid(realm);
  if (uuid === null) {
    const response = await adminRequest(`/admin/realms/${realm}/clients`, 'POST', desired);
    if (response.status !== 201) {
      throw new Error(`Failed to create ${CLIENT_ID} in ${realm}: ${response.status}`);
    }
    uuid = response.headers.get('Location')?.split('/').pop() ?? (await resolveClientUuid(realm));
  } else {
    const current = await readClient(realm, uuid);
    const attributes = current.attributes as Record<string, unknown> | undefined;
    const desiredAttributes = desired['attributes'] as Record<string, unknown>;
    const response = await adminRequest(`/admin/realms/${realm}/clients/${uuid}`, 'PUT', {
      ...current,
      ...desired,
      attributes: { ...attributes, ...desiredAttributes },
    });
    if (!response.ok)
      throw new Error(`Failed to update ${CLIENT_ID} in ${realm}: ${response.status}`);
  }
  if (uuid === null || uuid === '') throw new Error(`Could not resolve ${CLIENT_ID} in ${realm}`);
  return uuid;
}

async function synchronizeRoleScopes(realm: string, uuid: string): Promise<void> {
  const roles: KeycloakRole[] = [];
  for (const roleName of TENANT_ROLES) {
    const response = await adminRequest(`/admin/realms/${realm}/roles/${roleName}`, 'GET');
    if (!response.ok) throw new Error(`Missing ${roleName} role in ${realm}`);
    roles.push((await response.json()) as KeycloakRole);
  }
  const path = `/admin/realms/${realm}/clients/${uuid}/scope-mappings/realm`;
  const currentResponse = await adminRequest(path, 'GET');
  if (!currentResponse.ok) throw new Error(`Failed to read role scopes in ${realm}`);
  const current = (await currentResponse.json()) as KeycloakRole[];
  if (current.length > 0) {
    const deleteResponse = await adminRequest(path, 'DELETE', current);
    if (!deleteResponse.ok) throw new Error(`Failed to clear role scopes in ${realm}`);
  }
  const addResponse = await adminRequest(path, 'POST', roles);
  if (!addResponse.ok) throw new Error(`Failed to set role scopes in ${realm}`);
}

async function validateClient(realm: string, tenantSlug: string, uuid: string): Promise<void> {
  const client = await readClient(realm, uuid);
  const uris = buildTenantWebClientUris(tenantSlug);
  const expected: Record<string, unknown> = {
    publicClient: true,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    fullScopeAllowed: false,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (client[field] !== value) throw new Error(`${CLIENT_ID} ${realm} has invalid ${field}`);
  }
  if (JSON.stringify(client.redirectUris) !== JSON.stringify([uris.callbackUri])) {
    throw new Error(`${CLIENT_ID} ${realm} has invalid redirectUris`);
  }
  if (JSON.stringify(client.webOrigins) !== JSON.stringify([uris.origin])) {
    throw new Error(`${CLIENT_ID} ${realm} has invalid webOrigins`);
  }
  const attributes = client.attributes as Record<string, unknown> | undefined;
  if (attributes?.['pkce.code.challenge.method'] !== 'S256') throw new Error('PKCE S256 missing');
  if (attributes['post.logout.redirect.uris'] !== uris.logoutUri) {
    throw new Error(`${CLIENT_ID} ${realm} has invalid post-logout URI`);
  }
  const response = await adminRequest(
    `/admin/realms/${realm}/clients/${uuid}/scope-mappings/realm`,
    'GET'
  );
  if (!response.ok) throw new Error(`Failed to validate role scopes in ${realm}`);
  const scopes = (await response.json()) as Array<{ name?: unknown }>;
  const names = scopes.map(({ name }) => name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...TENANT_ROLES])) {
    throw new Error(`${CLIENT_ID} ${realm} has invalid role scopes: ${JSON.stringify(names)}`);
  }
}

export async function reconcileTenantWebClient(realm: string, tenantSlug: string): Promise<void> {
  const uuid = await upsertClient(realm, tenantSlug);
  await synchronizeRoleScopes(realm, uuid);
  await reconcileApiAudienceMapper(realm, uuid);
  await validateClient(realm, tenantSlug, uuid);
}

export async function reconcileAllTenantWebClients(): Promise<number> {
  const response = await adminRequest('/admin/realms', 'GET');
  if (!response.ok) throw new Error(`Failed to list Keycloak realms: ${response.status}`);
  const realms = (await response.json()) as Array<{ realm?: unknown }>;
  const tenantRealms = realms
    .map(({ realm }) => realm)
    .filter((realm): realm is string => typeof realm === 'string' && realm.startsWith('plexica-'));
  for (const realm of tenantRealms) {
    await reconcileTenantWebClient(realm, realm.slice('plexica-'.length));
  }
  return tenantRealms.length;
}
