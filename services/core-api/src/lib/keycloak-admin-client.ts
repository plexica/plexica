import { adminRequest } from './keycloak-admin-internal.js';
import { reconcileApiAudienceMapper } from './keycloak-audience.js';
import {
  ADMIN_CLIENT_ID,
  ADMIN_SESSION_LIMIT_SECONDS,
  buildAdminClientPayload,
  buildAdminClientUris,
} from './keycloak-admin-client-policy.js';

interface KeycloakClient extends Record<string, unknown> {
  id?: unknown;
  attributes?: unknown;
}

interface KeycloakRole {
  id: string;
  name: string;
}

async function requestJson<T>(path: string, failure: string): Promise<T> {
  const response = await adminRequest(path, 'GET');
  if (!response.ok) throw new Error(`${failure}: ${response.status}`);
  return (await response.json()) as T;
}

async function reconcileMasterSessionPolicy(): Promise<void> {
  const path = '/admin/realms/master';
  const current = await requestJson<Record<string, unknown>>(path, 'Failed to read master realm');
  const response = await adminRequest(path, 'PUT', {
    ...current,
    ssoSessionIdleTimeout: ADMIN_SESSION_LIMIT_SECONDS,
    ssoSessionMaxLifespan: ADMIN_SESSION_LIMIT_SECONDS,
  });
  if (!response.ok) throw new Error(`Failed to update master realm sessions: ${response.status}`);
  const verified = await requestJson<Record<string, unknown>>(
    path,
    'Failed to verify master realm'
  );
  for (const field of ['ssoSessionIdleTimeout', 'ssoSessionMaxLifespan']) {
    const seconds = Number(verified[field]);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > ADMIN_SESSION_LIMIT_SECONDS) {
      throw new Error(`Master realm has unsafe ${field}`);
    }
  }
}

async function resolveClientUuid(): Promise<string | null> {
  const matches = await requestJson<KeycloakClient[]>(
    `/admin/realms/master/clients?clientId=${ADMIN_CLIENT_ID}`,
    `Failed to find ${ADMIN_CLIENT_ID}`
  );
  if (matches.length > 1) throw new Error(`Multiple ${ADMIN_CLIENT_ID} clients exist`);
  if (matches[0] === undefined) return null;
  if (typeof matches[0].id !== 'string') throw new Error(`${ADMIN_CLIENT_ID} has no UUID`);
  return matches[0].id;
}

async function upsertClient(origin: string, nodeEnv: string): Promise<string> {
  const desired = buildAdminClientPayload(origin, nodeEnv);
  let uuid = await resolveClientUuid();
  if (uuid === null) {
    const response = await adminRequest('/admin/realms/master/clients', 'POST', desired);
    if (response.status !== 201)
      throw new Error(`Failed to create ${ADMIN_CLIENT_ID}: ${response.status}`);
    uuid = response.headers.get('Location')?.split('/').pop() ?? (await resolveClientUuid());
  } else {
    const current = await requestJson<KeycloakClient>(
      `/admin/realms/master/clients/${uuid}`,
      `Failed to read ${ADMIN_CLIENT_ID}`
    );
    const response = await adminRequest(`/admin/realms/master/clients/${uuid}`, 'PUT', {
      ...current,
      ...desired,
    });
    if (!response.ok) throw new Error(`Failed to update ${ADMIN_CLIENT_ID}: ${response.status}`);
  }
  if (uuid === null || uuid === '') throw new Error(`Could not resolve ${ADMIN_CLIENT_ID}`);
  return uuid;
}

async function ensureSuperAdminRole(): Promise<KeycloakRole> {
  let response = await adminRequest('/admin/realms/master/roles/super_admin', 'GET');
  if (response.status === 404) {
    const create = await adminRequest('/admin/realms/master/roles', 'POST', {
      name: 'super_admin',
      description: 'Super administrator with full platform access',
    });
    if (create.status !== 201) throw new Error(`Failed to create super_admin: ${create.status}`);
    response = await adminRequest('/admin/realms/master/roles/super_admin', 'GET');
  }
  if (!response.ok) throw new Error(`Failed to read super_admin: ${response.status}`);
  const role = (await response.json()) as Partial<KeycloakRole>;
  if (typeof role.id !== 'string' || role.name !== 'super_admin') {
    throw new Error('Keycloak returned an invalid super_admin role');
  }
  return { id: role.id, name: role.name };
}

async function synchronizeRoleScope(uuid: string): Promise<void> {
  const path = `/admin/realms/master/clients/${uuid}/scope-mappings/realm`;
  const current = await requestJson<KeycloakRole[]>(path, 'Failed to read admin role scopes');
  if (current.length > 0) {
    const cleared = await adminRequest(path, 'DELETE', current);
    if (!cleared.ok) throw new Error(`Failed to clear admin role scopes: ${cleared.status}`);
  }
  const added = await adminRequest(path, 'POST', [await ensureSuperAdminRole()]);
  if (!added.ok) throw new Error(`Failed to set admin role scope: ${added.status}`);
}

async function validateClient(origin: string, nodeEnv: string, uuid: string): Promise<void> {
  const client = await requestJson<KeycloakClient>(
    `/admin/realms/master/clients/${uuid}`,
    `Failed to verify ${ADMIN_CLIENT_ID}`
  );
  const expected = buildAdminClientPayload(origin, nodeEnv);
  for (const field of [
    'publicClient',
    'standardFlowEnabled',
    'implicitFlowEnabled',
    'directAccessGrantsEnabled',
    'serviceAccountsEnabled',
    'fullScopeAllowed',
    'redirectUris',
    'webOrigins',
  ]) {
    if (JSON.stringify(client[field]) !== JSON.stringify(expected[field])) {
      throw new Error(`${ADMIN_CLIENT_ID} has invalid ${field}`);
    }
  }
  const attributes = client.attributes as Record<string, unknown> | undefined;
  const expectedAttributes = expected['attributes'] as Record<string, string>;
  for (const [name, value] of Object.entries(expectedAttributes)) {
    if (attributes?.[name] !== value) throw new Error(`${ADMIN_CLIENT_ID} has invalid ${name}`);
  }
  for (const name of ['client.session.idle.timeout', 'client.session.max.lifespan']) {
    const seconds = Number(attributes?.[name]);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > ADMIN_SESSION_LIMIT_SECONDS) {
      throw new Error(`${ADMIN_CLIENT_ID} has unsafe ${name}`);
    }
  }
  const uris = buildAdminClientUris(origin, nodeEnv);
  if (nodeEnv === 'production' && JSON.stringify(client).match(/localhost|\*/i)) {
    throw new Error(`${ADMIN_CLIENT_ID} production read-back contains localhost or wildcard`);
  }
  if (uris.origin !== origin) throw new Error(`${ADMIN_CLIENT_ID} origin was not exact`);
  const scopes = await requestJson<Array<{ name?: unknown }>>(
    `/admin/realms/master/clients/${uuid}/scope-mappings/realm`,
    'Failed to verify admin role scopes'
  );
  if (scopes.length !== 1 || scopes[0]?.name !== 'super_admin') {
    throw new Error(`${ADMIN_CLIENT_ID} has invalid role scopes`);
  }
}

export async function reconcileAdminClient(origin: string, nodeEnv: string): Promise<void> {
  await reconcileMasterSessionPolicy();
  const uuid = await upsertClient(origin, nodeEnv);
  await synchronizeRoleScope(uuid);
  await reconcileApiAudienceMapper('master', uuid);
  await validateClient(origin, nodeEnv, uuid);
}
