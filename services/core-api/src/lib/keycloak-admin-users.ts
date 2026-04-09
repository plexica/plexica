// keycloak-admin-users.ts
// Keycloak Admin REST API — user lifecycle operations within a realm.
// Companion module to keycloak-admin.ts (token management) and
// keycloak-admin-realm.ts (realm configuration).

// adminRequest is imported directly from the internal module to avoid circular
// deps — keycloak-admin.ts re-exports it publicly but that would create a cycle.
import { KeycloakError } from './app-error.js';
import { adminRequest } from './keycloak-admin-internal.js';
import { logger } from './logger.js';

/**
 * Creates a new user in a tenant Keycloak realm.
 * Returns the Keycloak-assigned userId extracted from the Location header.
 *
 * @param requiredActions - Keycloak required actions set on the new account
 *   (e.g. ['UPDATE_PASSWORD']). Defaults to empty — callers that create
 *   invitation-accepted users MUST pass ['UPDATE_PASSWORD'] so the account
 *   is not accessible without setting a password first.
 */
export async function createRealmUser(
  realm: string,
  email: string,
  displayName: string,
  requiredActions: string[] = []
): Promise<{ userId: string }> {
  const nameParts = displayName.split(' ');
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ');

  const res = await adminRequest(`/admin/realms/${realm}/users`, 'POST', {
    username: email,
    email,
    enabled: true,
    emailVerified: false,
    firstName,
    lastName,
    requiredActions,
  });

  if (!res.ok) {
    throw new KeycloakError(`Failed to create user in realm ${realm}: ${res.status}`);
  }

  const location = res.headers.get('Location') ?? '';
  const userId = location.split('/').pop() ?? '';

  logger.debug({ realm, userId }, 'Keycloak user created');
  return { userId };
}

/**
 * Disables a user account in Keycloak (soft-lock, preserves data).
 */
export async function disableRealmUser(realm: string, userId: string): Promise<void> {
  const res = await adminRequest(`/admin/realms/${realm}/users/${userId}`, 'PUT', {
    enabled: false,
  });

  if (!res.ok) {
    throw new KeycloakError(`Failed to disable user ${userId} in realm ${realm}: ${res.status}`);
  }

  logger.debug({ realm, userId }, 'Keycloak user disabled');
}

/**
 * Terminates all active sessions for a user (forces re-authentication).
 */
export async function terminateUserSessions(realm: string, userId: string): Promise<void> {
  const res = await adminRequest(`/admin/realms/${realm}/users/${userId}/sessions`, 'DELETE');

  if (!res.ok && res.status !== 404) {
    throw new KeycloakError(
      `Failed to terminate sessions for user ${userId} in realm ${realm}: ${res.status}`
    );
  }

  logger.debug({ realm, userId }, 'Keycloak user sessions terminated');
}

/**
 * Syncs a user's display name to Keycloak firstName/lastName attributes.
 */
export async function syncDisplayName(realm: string, userId: string, name: string): Promise<void> {
  const parts = name.split(' ');
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');

  const res = await adminRequest(`/admin/realms/${realm}/users/${userId}`, 'PUT', {
    firstName,
    lastName,
  });

  if (!res.ok) {
    throw new KeycloakError(
      `Failed to sync display name for user ${userId} in realm ${realm}: ${res.status}`
    );
  }

  logger.debug({ realm, userId }, 'Keycloak user display name synced');
}
