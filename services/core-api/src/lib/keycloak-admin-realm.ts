// keycloak-admin-realm.ts
// Keycloak Admin REST API — realm authentication configuration.
// Companion to keycloak-admin.ts (realm lifecycle) and
// keycloak-admin-users.ts (user management).

import { logger } from './logger.js';
import { adminRequestOk } from './keycloak-admin-internal.js';

/** Subset of Keycloak realm representation relevant to auth configuration. */
export interface RealmAuthConfig {
  loginTheme: string;
  ssoSessionMaxLifespan: number;
  bruteForceProtected: boolean;
  failureFactor: number;
}

/**
 * Retrieves the current auth configuration for a realm.
 */
export async function getRealmConfig(realm: string): Promise<RealmAuthConfig> {
  const res = await adminRequestOk(`/admin/realms/${realm}`, 'GET', undefined, {
    context: `Failed to get realm config for ${realm}`,
  });

  const data = (await res.json()) as Record<string, unknown>;

  logger.debug({ realm }, 'Keycloak realm config fetched');

  return {
    loginTheme: typeof data['loginTheme'] === 'string' ? data['loginTheme'] : 'plexica',
    ssoSessionMaxLifespan:
      typeof data['ssoSessionMaxLifespan'] === 'number' ? data['ssoSessionMaxLifespan'] : 36000,
    bruteForceProtected:
      typeof data['bruteForceProtected'] === 'boolean' ? data['bruteForceProtected'] : true,
    failureFactor: typeof data['failureFactor'] === 'number' ? data['failureFactor'] : 30,
  };
}

/**
 * Updates the auth configuration for a realm with the given patch.
 */
export async function updateRealmConfig(
  realm: string,
  patch: Partial<RealmAuthConfig>
): Promise<void> {
  await adminRequestOk(`/admin/realms/${realm}`, 'PUT', patch, {
    context: `Failed to update realm config for ${realm}`,
  });

  logger.debug({ realm, patch }, 'Keycloak realm config updated');
}

/**
 * Enables or disables a Keycloak realm by toggling the top-level `enabled`
 * flag via PUT /admin/realms/{realm}. Keycloak merges partial
 * RealmRepresentation payloads for scalar fields, so a single-field patch is
 * sufficient. Disabling a realm blocks all new logins / token issuance for its
 * users; existing sessions remain until they expire or are explicitly revoked.
 */
export async function setRealmEnabled(realm: string, enabled: boolean): Promise<void> {
  await adminRequestOk(
    `/admin/realms/${realm}`,
    'PUT',
    { enabled },
    {
      context: `Failed to ${enabled ? 'enable' : 'disable'} realm ${realm}`,
    }
  );

  logger.info({ realm, enabled }, 'Keycloak realm enabled flag updated');
}
