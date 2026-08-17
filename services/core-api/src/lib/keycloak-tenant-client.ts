// keycloak-tenant-client.ts
// Reconciles the per-tenant plexica-web OIDC client. The generic reconcile
// flow lives in keycloak-client-reconciler.ts; this file holds only the
// tenant-specific policy (required realm roles) and the all-realms sweep.

import { adminRequestOk } from './keycloak-admin-internal.js';
import { reconcileKeycloakClient } from './keycloak-client-reconciler.js';
import { buildClientPayload } from './keycloak-admin-helpers.js';

import type { KeycloakRole } from './keycloak-client-reconciler.js';

const CLIENT_ID = 'plexica-web';
const TENANT_ROLES = ['member', 'tenant_admin'] as const;

async function readTenantRoles(realm: string): Promise<KeycloakRole[]> {
  const roles: KeycloakRole[] = [];
  for (const roleName of TENANT_ROLES) {
    const response = await adminRequestOk(
      `/admin/realms/${realm}/roles/${roleName}`,
      'GET',
      undefined,
      { context: `Missing ${roleName} role in ${realm}` }
    );
    roles.push((await response.json()) as KeycloakRole);
  }
  return roles;
}

export async function reconcileTenantWebClient(realm: string, tenantSlug: string): Promise<void> {
  await reconcileKeycloakClient({
    realm,
    clientId: CLIENT_ID,
    desired: buildClientPayload(CLIENT_ID, tenantSlug),
    resolveRoles: () => readTenantRoles(realm),
    expectedScopeNames: TENANT_ROLES,
  });
}

export async function reconcileAllTenantWebClients(): Promise<number> {
  const response = await adminRequestOk('/admin/realms', 'GET', undefined, {
    context: 'Failed to list Keycloak realms',
  });
  const realms = (await response.json()) as Array<{ realm?: unknown }>;
  const tenantRealms = realms
    .map(({ realm }) => realm)
    .filter((realm): realm is string => typeof realm === 'string' && realm.startsWith('plexica-'));
  for (const realm of tenantRealms) {
    await reconcileTenantWebClient(realm, realm.slice('plexica-'.length));
  }
  return tenantRealms.length;
}
