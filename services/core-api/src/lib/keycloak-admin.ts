// keycloak-admin.ts
// Keycloak Admin REST API client — token management and realm lifecycle.
// Uses native fetch (Node.js 18+).

import { randomUUID } from 'node:crypto';

import { logger } from './logger.js';
import { adminRequest, invalidateAdminTokenCache } from './keycloak-admin-internal.js';
import { reconcileTenantWebClient } from './keycloak-tenant-client.js';
import {
  buildRealmPayload,
  buildRolePayload,
  buildAdminUserPayload,
  type RealmConfig,
} from './keycloak-admin-helpers.js';

export type { RealmConfig };

export interface CreateRealmResult {
  /** Temporary password set on the initial admin user. Must be changed on first login. */
  tempPassword: string;
}

export async function createRealm(realmConfig: RealmConfig): Promise<CreateRealmResult> {
  const { realmName, adminEmail, tenantSlug } = realmConfig;

  // Create realm
  const realmRes = await adminRequest('/admin/realms', 'POST', buildRealmPayload(realmName));
  if (!realmRes.ok && realmRes.status !== 409) {
    throw new Error(`Failed to create realm ${realmName}: ${realmRes.status}`);
  }
  logger.debug({ realmName }, 'Keycloak realm created');

  // Create default roles
  for (const role of [
    { name: 'tenant_admin', description: 'Tenant administrator' },
    { name: 'member', description: 'Regular tenant member' },
  ]) {
    const roleRes = await adminRequest(
      `/admin/realms/${realmName}/roles`,
      'POST',
      buildRolePayload(role.name, role.description)
    );
    if (!roleRes.ok && roleRes.status !== 409) {
      logger.warn({ realmName, role: role.name }, 'Failed to create role');
    }
  }

  // Reconcile even pre-existing clients so retries and migrations remove drift.
  await reconcileTenantWebClient(realmName, tenantSlug);

  // L-3: Cryptographically random temporary password
  const tempPassword = `Tmp-${randomUUID()}`;
  const userRes = await adminRequest(
    `/admin/realms/${realmName}/users`,
    'POST',
    buildAdminUserPayload(adminEmail, tempPassword)
  );
  if (!userRes.ok && userRes.status !== 409) {
    logger.warn({ realmName, adminEmail }, 'Failed to create initial admin user');
  }

  // Resolve the admin user's internal UUID to assign the tenant_admin role.
  // The Location header on 201 carries the UUID; fall back to a lookup if absent.
  let userUuid: string | null = null;
  if (userRes.status === 201) {
    const location = userRes.headers.get('Location') ?? '';
    userUuid = location.split('/').pop() ?? null;
  }
  if (userUuid === null || userUuid === '') {
    const lookupRes = await adminRequest(
      `/admin/realms/${realmName}/users?username=${encodeURIComponent(adminEmail)}`,
      'GET'
    );
    if (lookupRes.ok) {
      const users = (await lookupRes.json()) as Array<{ id: string }>;
      userUuid = users[0]?.id ?? null;
    }
  }

  // Assign the tenant_admin realm role to the initial admin user.
  if (userUuid !== null) {
    // Fetch the tenant_admin role representation (we need its id + name for the mapping).
    const roleRes = await adminRequest(`/admin/realms/${realmName}/roles/tenant_admin`, 'GET');
    if (roleRes.ok) {
      const role = (await roleRes.json()) as { id: string; name: string };
      const assignRes = await adminRequest(
        `/admin/realms/${realmName}/users/${userUuid}/role-mappings/realm`,
        'POST',
        [{ id: role.id, name: role.name }]
      );
      if (!assignRes.ok) {
        logger.warn({ realmName, adminEmail, userUuid }, 'Failed to assign tenant_admin role');
      } else {
        logger.debug({ realmName, adminEmail }, 'tenant_admin role assigned to initial admin user');
      }
    } else {
      logger.warn({ realmName }, 'Could not fetch tenant_admin role — role assignment skipped');
    }
  } else {
    logger.warn(
      { realmName, adminEmail },
      'Could not resolve admin user UUID — role assignment skipped'
    );
  }

  logger.info({ realmName }, 'Keycloak realm provisioned');
  return { tempPassword };
}

/**
 * Checks whether a Keycloak realm exists.
 * Uses the admin REST API: GET /admin/realms/{realm} returns 200 if present,
 * 404 if absent. Any other status is treated as a Keycloak service error.
 */
export async function realmExists(realmName: string): Promise<boolean> {
  const res = await adminRequest(`/admin/realms/${realmName}`, 'GET');
  if (res.ok) return true;
  if (res.status === 404) return false;
  throw new Error(`Failed to check realm ${realmName}: ${res.status}`);
}

export async function deleteRealm(realmName: string): Promise<void> {
  const res = await adminRequest(`/admin/realms/${realmName}`, 'DELETE');
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete realm ${realmName}: ${res.status}`);
  }
  invalidateAdminTokenCache();
  logger.info({ realmName }, 'Keycloak realm deleted');
}
