// keycloak-admin.ts
// Keycloak Admin REST API client — token management and realm lifecycle.
// Uses native fetch (Node.js 18+).

import { randomUUID } from 'node:crypto';

import { logger } from './logger.js';
import { adminRequest, invalidateAdminTokenCache } from './keycloak-admin-internal.js';
import {
  buildRealmPayload,
  buildClientPayload,
  buildAudienceMapperPayload,
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

  // M-bonus: scope redirect URIs and web origins to this tenant's domain.
  const productionOrigin = `https://${tenantSlug}.plexica.io`;
  const redirectUris = [`${productionOrigin}/*`, 'http://localhost:3000/*'];
  const webOrigins = [productionOrigin, 'http://localhost:3000'];

  // Create OIDC client
  const clientRes = await adminRequest(
    `/admin/realms/${realmName}/clients`,
    'POST',
    buildClientPayload('plexica-web', redirectUris, webOrigins)
  );
  if (!clientRes.ok && clientRes.status !== 409) {
    const body = await clientRes.text().catch(() => '');
    throw new Error(
      `Failed to create client in realm ${realmName}: ${clientRes.status}${body !== '' ? ` — ${body}` : ''}`
    );
  }

  // Resolve the client's internal UUID so we can attach the audience mapper.
  let clientUuid: string | null = null;
  if (clientRes.status === 201) {
    const location = clientRes.headers.get('Location') ?? '';
    clientUuid = location.split('/').pop() ?? null;
  }
  if (clientUuid === null || clientUuid === '') {
    const lookupRes = await adminRequest(
      `/admin/realms/${realmName}/clients?clientId=plexica-web`,
      'GET'
    );
    if (lookupRes.ok) {
      const clients = (await lookupRes.json()) as Array<{ id: string }>;
      clientUuid = clients[0]?.id ?? null;
    }
  }

  // Add the audience mapper
  if (clientUuid !== null) {
    const mapperRes = await adminRequest(
      `/admin/realms/${realmName}/clients/${clientUuid}/protocol-mappers/models`,
      'POST',
      buildAudienceMapperPayload('plexica-web')
    );
    if (!mapperRes.ok && mapperRes.status !== 409) {
      logger.warn({ realmName, clientUuid }, 'Failed to add audience mapper to client');
    }
  } else {
    logger.warn({ realmName }, 'Could not resolve client UUID — audience mapper not added');
  }

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

  logger.info({ realmName }, 'Keycloak realm provisioned');
  return { tempPassword };
}

export async function deleteRealm(realmName: string): Promise<void> {
  const res = await adminRequest(`/admin/realms/${realmName}`, 'DELETE');
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete realm ${realmName}: ${res.status}`);
  }
  invalidateAdminTokenCache();
  logger.info({ realmName }, 'Keycloak realm deleted');
}
