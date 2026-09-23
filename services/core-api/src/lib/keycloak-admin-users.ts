// keycloak-admin-users.ts
// Keycloak Admin REST API — user lifecycle operations within a realm.
// Companion module to keycloak-admin.ts (token management) and
// keycloak-admin-realm.ts (realm configuration).

// adminRequestOk is imported directly from the internal module to avoid circular
// deps — keycloak-admin.ts re-exports it publicly but that would create a cycle.
import { adminRequestOk } from './keycloak-admin-internal.js';
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

  const res = await adminRequestOk(
    `/admin/realms/${realm}/users`,
    'POST',
    {
      username: email,
      email,
      enabled: true,
      emailVerified: false,
      firstName,
      lastName,
      requiredActions,
    },
    { context: `Failed to create user in realm ${realm}` }
  );

  const location = res.headers.get('Location') ?? '';
  const userId = location.split('/').pop() ?? '';

  logger.debug({ realm, userId }, 'Keycloak user created');
  return { userId };
}

/**
 * Disables a user account in Keycloak (soft-lock, preserves data).
 */
export async function disableRealmUser(realm: string, userId: string): Promise<void> {
  await adminRequestOk(
    `/admin/realms/${realm}/users/${userId}`,
    'PUT',
    { enabled: false },
    { context: `Failed to disable user ${userId} in realm ${realm}` }
  );

  logger.debug({ realm, userId }, 'Keycloak user disabled');
}

/**
 * Terminates all active sessions for a user (forces re-authentication).
 */
export async function terminateUserSessions(realm: string, userId: string): Promise<void> {
  await adminRequestOk(`/admin/realms/${realm}/users/${userId}/sessions`, 'DELETE', undefined, {
    tolerate: [404],
    context: `Failed to terminate sessions for user ${userId} in realm ${realm}`,
  });

  logger.debug({ realm, userId }, 'Keycloak user sessions terminated');
}

/**
 * A single active Keycloak SSO session (subset of the Admin API
 * UserSessionRepresentation — only the fields the profile UI needs).
 */
export interface KeycloakUserSession {
  id: string;
  username: string;
  userId: string;
  ipAddress?: string;
  /** Session start, epoch milliseconds. */
  start: number;
  /** Last access, epoch milliseconds. */
  lastAccess: number;
  /** Map of internal client UUID → clientId. */
  clients?: Record<string, string>;
}

/**
 * Lists the active SSO sessions of a user in a realm (006-13).
 */
export async function listUserSessions(
  realm: string,
  userId: string
): Promise<KeycloakUserSession[]> {
  const res = await adminRequestOk(
    `/admin/realms/${realm}/users/${userId}/sessions`,
    'GET',
    undefined,
    { context: `Failed to list sessions for user ${userId} in realm ${realm}` }
  );

  const sessions = (await res.json()) as KeycloakUserSession[];
  logger.debug({ realm, userId, count: sessions.length }, 'Keycloak user sessions listed');
  return sessions;
}

/**
 * Deletes a single SSO session by ID (006-13). Tolerates 404 — the session
 * may have expired between the ownership check and this call; a gone session
 * is already revoked from the caller's point of view.
 */
export async function deleteUserSession(realm: string, sessionId: string): Promise<void> {
  await adminRequestOk(`/admin/realms/${realm}/sessions/${sessionId}`, 'DELETE', undefined, {
    tolerate: [404],
    context: `Failed to delete session ${sessionId} in realm ${realm}`,
  });

  logger.debug({ realm, sessionId }, 'Keycloak user session deleted');
}

/**
 * Syncs a user's email address to Keycloak (006-11). The new address starts
 * unverified — Keycloak must re-verify it before it is trusted.
 * Throws KeycloakError on rejection/failure; callers must NOT write the local
 * email when this rejects (Keycloak-first, no divergence).
 */
export async function syncEmail(realm: string, userId: string, email: string): Promise<void> {
  await adminRequestOk(
    `/admin/realms/${realm}/users/${userId}`,
    'PUT',
    { email, emailVerified: false },
    { context: `Failed to sync email for user ${userId} in realm ${realm}` }
  );

  logger.debug({ realm, userId }, 'Keycloak user email synced');
}

/**
 * Reads a user's CURRENT email from Keycloak (006-11 round-2 #7).
 * Compensation helper: the local profile row may still hold the ''
 * auto-provisioned placeholder while Keycloak already has a real address —
 * reverting Keycloak to the local value would clear that address (or fail
 * under realm rules). Callers capture this BEFORE mutating so a failed local
 * write reverts Keycloak to its own previous value. Read-only: throws
 * KeycloakError on failure, so callers abort before any mutation.
 */
export async function getRealmUserEmail(realm: string, userId: string): Promise<string> {
  const res = await adminRequestOk(`/admin/realms/${realm}/users/${userId}`, 'GET', undefined, {
    context: `Failed to read user ${userId} in realm ${realm}`,
  });

  const body = (await res.json()) as { email?: unknown };
  return typeof body.email === 'string' ? body.email : '';
}

/**
 * Syncs a user's display name to Keycloak firstName/lastName attributes.
 */
export async function syncDisplayName(realm: string, userId: string, name: string): Promise<void> {
  const parts = name.split(' ');
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');

  await adminRequestOk(
    `/admin/realms/${realm}/users/${userId}`,
    'PUT',
    { firstName, lastName },
    { context: `Failed to sync display name for user ${userId} in realm ${realm}` }
  );

  logger.debug({ realm, userId }, 'Keycloak user display name synced');
}
