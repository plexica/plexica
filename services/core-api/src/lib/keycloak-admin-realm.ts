// keycloak-admin-realm.ts
// Keycloak Admin REST API — realm authentication configuration.
// Companion to keycloak-admin.ts (realm lifecycle) and
// keycloak-admin-users.ts (user management).

import { KeycloakError } from './app-error.js';
import { logger } from './logger.js';
import { adminRequest } from './keycloak-admin-internal.js';

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
  const res = await adminRequest(`/admin/realms/${realm}`, 'GET');

  if (!res.ok) {
    throw new KeycloakError(`Failed to get realm config for ${realm}: ${res.status}`);
  }

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
  const res = await adminRequest(`/admin/realms/${realm}`, 'PUT', patch);

  if (!res.ok) {
    throw new KeycloakError(`Failed to update realm config for ${realm}: ${res.status}`);
  }

  logger.debug({ realm, patch }, 'Keycloak realm config updated');
}
