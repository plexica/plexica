// service-remove.ts
// Orchestrates the removeUser flow: memberships, profile soft-delete, Keycloak.
// Implements: user removal, tenant isolation, audit trail.

import { logger } from '../../lib/logger.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { disableRealmUser, terminateUserSessions } from '../../lib/keycloak-admin-users.js';
import { writeAuditLog } from '../audit-log/writer.js';
import { UserNotFoundError } from '../../lib/app-error.js';

import { findRawProfile, softDeleteProfile, removeAllMemberships } from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { RemoveUserInput } from './types.js';

/**
 * Removes a user from the tenant:
 * 1. Verify target exists (throw UserNotFoundError if not)
 * 2. Remove all workspace memberships
 * 3. Soft-delete the profile (status=disabled, deleted_at=now)
 * 4. Write audit log
 * 5. Out-of-transaction: disable Keycloak account and kill sessions
 */
export async function removeUser(
  targetUserId: string,
  actorId: string,
  input: RemoveUserInput,
  tenantContext: TenantContext
): Promise<void> {
  // Run the DB mutation inside a single tenant transaction.
  // We capture keycloakUserId so we can make Keycloak calls after the commit.
  // Initialized to '' — withTenantDb either sets it or throws, so the Keycloak
  // calls below are only reached when the variable holds the real value.
  let keycloakUserId = '';

  await withTenantDb(async (tx) => {
    const profile = await findRawProfile(tx, targetUserId);

    if (profile === null) {
      throw new UserNotFoundError(`User ${targetUserId} not found in this tenant`);
    }

    keycloakUserId = profile.keycloakUserId;

    // Remove all workspace memberships (reassignment requests are noted but
    // content ownership is a plugin-level concern — we simply drop memberships).
    // Log each workspace that had a requested reassignment for the audit trail.
    if (input.reassignments.length > 0) {
      logger.debug(
        { targetUserId, reassignments: input.reassignments.map((r) => r.workspaceId) },
        'user-management: reassignment requested — memberships will be removed; content ownership is plugin-level'
      );
    }

    await removeAllMemberships(tx, targetUserId);

    await softDeleteProfile(tx, targetUserId);

    writeAuditLog(tx, {
      actorId,
      actionType: 'profile.update',
      targetType: 'user',
      targetId: targetUserId,
      afterValue: { status: 'disabled', removedBy: actorId },
    });
  }, tenantContext);

  // Out-of-transaction Keycloak calls. Failures must not roll back the DB state.
  const realm = tenantContext.realmName;

  try {
    await disableRealmUser(realm, keycloakUserId);
  } catch (err) {
    logger.error(
      { err, targetUserId, realm },
      'user-management: failed to disable Keycloak user after DB removal'
    );
  }

  try {
    await terminateUserSessions(realm, keycloakUserId);
  } catch (err) {
    logger.error(
      { err, targetUserId, realm },
      'user-management: failed to terminate Keycloak sessions after DB removal'
    );
  }
}
