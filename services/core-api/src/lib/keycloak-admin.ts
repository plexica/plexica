// keycloak-admin.ts
// Keycloak Admin REST API client — token management and realm lifecycle.
// Uses native fetch (Node.js 18+). Token cached for its expires_in duration.

import { randomUUID } from 'node:crypto';

import { logger } from './logger.js';
import { config } from './config.js';
import {
  buildRealmPayload,
  buildClientPayload,
  buildRolePayload,
  buildAdminUserPayload,
  type RealmConfig,
} from './keycloak-admin-helpers.js';

interface AdminToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: AdminToken | null = null;

async function getAdminToken(): Promise<string> {
  if (cachedToken !== null && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const url = `${config.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: config.KEYCLOAK_ADMIN_USER,
    password: config.KEYCLOAK_ADMIN_PASSWORD,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Keycloak admin token fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 10) * 1000,
  };

  return cachedToken.accessToken;
}

async function adminRequest(path: string, method: string, body?: unknown): Promise<Response> {
  const token = await getAdminToken();
  return fetch(`${config.KEYCLOAK_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

export async function createRealm(realmConfig: RealmConfig): Promise<void> {
  const { realmName, adminEmail, tenantSlug } = realmConfig;

  // Create realm
  const realmRes = await adminRequest('/admin/realms', 'POST', buildRealmPayload(realmName));
  if (!realmRes.ok && realmRes.status !== 409) {
    throw new Error(`Failed to create realm ${realmName}: ${realmRes.status}`);
  }
  logger.debug({ realmName }, 'Keycloak realm created');

  // M-bonus: scope redirect URIs and web origins to this tenant's domain.
  // Avoids the open-redirect / token leakage risk of wildcard ['*'].
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
    throw new Error(`Failed to create client in realm ${realmName}: ${clientRes.status}`);
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

  // L-3: Use a cryptographically random temporary password instead of the
  // predictable timestamp-based pattern that an attacker could guess during
  // the window before the admin's first login.
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
}

export async function deleteRealm(realmName: string): Promise<void> {
  const res = await adminRequest(`/admin/realms/${realmName}`, 'DELETE');
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete realm ${realmName}: ${res.status}`);
  }
  cachedToken = null; // Invalidate token cache after destructive operations
  logger.info({ realmName }, 'Keycloak realm deleted');
}
