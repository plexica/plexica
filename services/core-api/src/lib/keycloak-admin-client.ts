// keycloak-admin-client.ts
// Reconciles the master-realm plexica-admin OIDC client. The generic reconcile
// flow lives in keycloak-client-reconciler.ts; this file holds only the
// admin-specific policy: master-realm session caps, super_admin role bootstrap,
// and the session/security read-back assertions.

import { KeycloakError } from './app-error.js';
import { adminRequest, adminRequestOk } from './keycloak-admin-internal.js';
import { reconcileKeycloakClient } from './keycloak-client-reconciler.js';
import {
  ADMIN_CLIENT_ID,
  ADMIN_SESSION_LIMIT_SECONDS,
  buildAdminClientPayload,
  buildAdminClientUris,
} from './keycloak-admin-client-policy.js';

import type { KeycloakClient, KeycloakRole } from './keycloak-client-reconciler.js';

const MASTER_REALM = 'master';
const SESSION_ATTRIBUTE_NAMES = [
  'client.session.idle.timeout',
  'client.session.max.lifespan',
] as const;

async function requestJson<T>(path: string, failure: string): Promise<T> {
  const response = await adminRequestOk(path, 'GET', undefined, { context: failure });
  return (await response.json()) as T;
}

async function reconcileMasterSessionPolicy(): Promise<void> {
  const path = `/admin/realms/${MASTER_REALM}`;
  const current = await requestJson<Record<string, unknown>>(path, 'Failed to read master realm');
  await adminRequestOk(
    path,
    'PUT',
    {
      ...current,
      ssoSessionIdleTimeout: ADMIN_SESSION_LIMIT_SECONDS,
      ssoSessionMaxLifespan: ADMIN_SESSION_LIMIT_SECONDS,
    },
    { context: 'Failed to update master realm sessions' }
  );
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

async function ensureSuperAdminRole(): Promise<KeycloakRole> {
  let response = await adminRequest(`/admin/realms/${MASTER_REALM}/roles/super_admin`, 'GET');
  if (response.status === 404) {
    const create = await adminRequest(`/admin/realms/${MASTER_REALM}/roles`, 'POST', {
      name: 'super_admin',
      description: 'Super administrator with full platform access',
    });
    if (create.status !== 201) throw new Error(`Failed to create super_admin: ${create.status}`);
    response = await adminRequest(`/admin/realms/${MASTER_REALM}/roles/super_admin`, 'GET');
  }
  if (!response.ok) {
    throw new KeycloakError(`Failed to read super_admin: ${response.status}`);
  }
  const role = (await response.json()) as Partial<KeycloakRole>;
  if (typeof role.id !== 'string' || role.name !== 'super_admin') {
    throw new Error('Keycloak returned an invalid super_admin role');
  }
  return { id: role.id, name: role.name };
}

function validateAdminSecurity(client: KeycloakClient, origin: string, nodeEnv: string): void {
  const attributes = client.attributes as Record<string, unknown> | undefined;
  for (const name of SESSION_ATTRIBUTE_NAMES) {
    const seconds = Number(attributes?.[name]);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > ADMIN_SESSION_LIMIT_SECONDS) {
      throw new Error(`${ADMIN_CLIENT_ID} has unsafe ${name}`);
    }
  }
  if (nodeEnv === 'production' && JSON.stringify(client).match(/localhost|\*/i)) {
    throw new Error(`${ADMIN_CLIENT_ID} production read-back contains localhost or wildcard`);
  }
  if (buildAdminClientUris(origin, nodeEnv).origin !== origin) {
    throw new Error(`${ADMIN_CLIENT_ID} origin was not exact`);
  }
}

export async function reconcileAdminClient(origin: string, nodeEnv: string): Promise<void> {
  await reconcileMasterSessionPolicy();
  await reconcileKeycloakClient({
    realm: MASTER_REALM,
    clientId: ADMIN_CLIENT_ID,
    desired: buildAdminClientPayload(origin, nodeEnv),
    resolveRoles: async () => [await ensureSuperAdminRole()],
    expectedScopeNames: ['super_admin'],
    extraValidation: (client) => validateAdminSecurity(client, origin, nodeEnv),
  });
}
