// service-remove.ts
// Orchestrates the removeUser flow: memberships, profile soft-delete, ABAC
// cache revocation, Keycloak.
// Implements: user removal, tenant isolation, audit trail.

import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { disableRealmUser, terminateUserSessions } from '../../lib/keycloak-admin-users.js';
import { setAbacMembership } from '../abac/engine.js';
import { writeAuditLog } from '../audit-log/writer.js';
import { UserNotFoundError } from '../../lib/app-error.js';

import {
  findRawProfile,
  softDeleteProfile,
  removeAllMemberships,
  lockTenantAdminRemoval,
} from './repository.js';
import { fetchTenantAdminKeycloakIds, assertNotLastTenantAdmin } from './admin-guard.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { RemoveUserInput } from './types.js';

/**
 * Publishes an ABAC revocation tombstone (`role: null`) for every workspace the
 * user was just removed from.
 *
 * WHY THIS EXISTS: the ABAC engine caches membership in Redis for up to
 * ABAC_CACHE_TTL_SECONDS (default 300). Deleting the workspace_member rows does
 * NOT touch that cache, and none of the other gates fail closed in time — the
 * JWT stays signature-valid until `exp` (auth-middleware does no introspection)
 * and the Keycloak calls below are best-effort. Without this write-through a
 * removed user keeps full read AND write access to every workspace they were a
 * member of for the remainder of the TTL.
 *
 * Best-effort but never silent: a Redis outage must not roll back a committed
 * removal, yet it must be visible in the logs because it re-opens exactly that
 * window. No PII is logged (workspace IDs and the tenant slug only).
 */
async function revokeAbacMemberships(
  tenantSlug: string,
  userId: string,
  workspaceIds: string[]
): Promise<void> {
  await Promise.all(
    workspaceIds.map((workspaceId) =>
      setAbacMembership(tenantSlug, userId, workspaceId, { role: null }, redis).catch(
        (err: unknown) => {
          logger.error(
            { err: String(err), workspaceId, tenantSlug },
            'user-management: ABAC membership revocation failed after user removal — cached authorization may survive until TTL expiry'
          );
        }
      )
    )
  );
}

/**
 * Removes a user from the tenant:
 * 1. Before the transaction: fetch the Keycloak tenant_admin set (HTTP — must
 *    stay outside any transaction) and run the fast-path last-admin check
 * 2. Atomically (single DB transaction): verify the target exists; when the
 *    target holds tenant_admin, take the per-tenant advisory lock and RE-RUN
 *    the last-admin check on the transaction client (authoritative — closes
 *    the check-then-act race of two admins removing each other); then remove
 *    memberships and soft-delete the profile (status=disabled, deleted_at=now)
 * 3. After the commit, on the non-transactional client: write the audit log
 * 4. After the commit: publish ABAC revocation tombstones for every workspace
 * 5. After the commit, outside the DB entirely: disable the Keycloak account
 *    and then terminate its active sessions
 *
 * Steps 3–5 are best-effort: their failures are logged, never rolled back.
 * The Keycloak order matters — disable first so a session terminated in the
 * same window cannot be re-established by a still-valid refresh token.
 *
 * The existence check runs INSIDE the transaction and the soft delete is a
 * conditional updateMany asserting exactly one row transitioned, so two
 * concurrent removals cannot both "succeed": the loser rolls back and reports
 * 404 instead of committing a no-op and duplicating the audit row and the
 * Keycloak calls.
 */
export async function removeUser(
  targetUserId: string,
  actorId: string,
  input: RemoveUserInput,
  tenantContext: TenantContext
): Promise<void> {
  // withTenantDb only opens a tenant-scoped connection — it does NOT start a
  // transaction. The read and the mutating statements are wrapped in an
  // explicit `$transaction` so a failure cannot leave the user membership-less
  // with a still-active profile. Both variables are populated inside the
  // transaction and only read after it has committed: any throw propagates
  // out of withTenantDb and skips every post-commit step below.
  let keycloakUserId = '';
  let revokedWorkspaceIds: string[] = [];

  await withTenantDb(async (db) => {
    // The Keycloak admin-set fetch stays BEFORE the transaction: it is an
    // HTTP call and a transaction must never sit open across the network.
    // A null profile is not reported here — the transaction's findRawProfile
    // below throws the real UserNotFoundError, so removing a non-existent
    // user keeps its existing 404 behaviour untouched.
    const preCheckProfile = await findRawProfile(db, targetUserId);
    let adminKeycloakIds: Set<string> | null = null;
    if (preCheckProfile !== null) {
      adminKeycloakIds = await fetchTenantAdminKeycloakIds(tenantContext.realmName);
      // Fast-path check on the outer client (NOT authoritative — check-then-
      // act race): the locked re-check inside the transaction below is.
      await assertNotLastTenantAdmin(
        db,
        targetUserId,
        preCheckProfile.keycloakUserId,
        adminKeycloakIds
      );
    }

    // Reassignment requests are noted but content ownership is a plugin-level
    // concern — we simply drop memberships.
    if (input.reassignments.length > 0) {
      logger.debug(
        { targetUserId, reassignments: input.reassignments.map((r) => r.workspaceId) },
        'user-management: reassignment requested — memberships will be removed; content ownership is plugin-level'
      );
    }

    await db.$transaction(async (tx) => {
      const profile = await findRawProfile(tx, targetUserId);

      if (profile === null) {
        throw new UserNotFoundError(`User ${targetUserId} not found in this tenant`);
      }

      // Authoritative last-admin check, serialized per tenant. The advisory
      // lock is taken ONLY when the target holds tenant_admin, so member
      // removals never serialize on it. A concurrent remover of the OTHER
      // last admin either holds the lock (we wait for its COMMIT, see its
      // soft delete, throw 409) or arrives after us.
      if (adminKeycloakIds !== null && adminKeycloakIds.has(profile.keycloakUserId)) {
        await lockTenantAdminRemoval(tx, tenantContext.tenantId);
        await assertNotLastTenantAdmin(tx, targetUserId, profile.keycloakUserId, adminKeycloakIds);
      }

      keycloakUserId = profile.keycloakUserId;
      revokedWorkspaceIds = await removeAllMemberships(tx, targetUserId);

      // Conditional (WHERE deleted_at IS NULL) — 0 means another removal won
      // the race and already soft-deleted this profile. Throwing rolls back the
      // membership deletion too, so this call is a complete no-op.
      const softDeleted = await softDeleteProfile(tx, targetUserId);
      if (softDeleted !== 1) {
        throw new UserNotFoundError(`User ${targetUserId} not found in this tenant`);
      }
    });

    // Audit is written AFTER the commit, on the non-transactional client, and
    // deliberately NOT inside the $transaction: writeAuditLog swallows its own
    // errors, but a failed INSERT still leaves PostgreSQL in an aborted
    // transaction (25P02) — as the last statement it would silently turn the
    // COMMIT into a ROLLBACK and report success on data that was never written.
    await writeAuditLog(db, {
      actorId,
      actionType: 'profile.update',
      targetType: 'user',
      targetId: targetUserId,
      afterValue: { status: 'disabled', removedBy: actorId },
    });
  }, tenantContext);

  // Revoke every cached workspace membership before anything else post-commit:
  // this is the only step that shortens the authorization window without
  // depending on Keycloak being reachable.
  await revokeAbacMemberships(tenantContext.slug, targetUserId, revokedWorkspaceIds);

  // Post-commit Keycloak calls. Failures must not roll back the DB state.
  // Disable the account before killing sessions: the reverse order would leave
  // a window where a refresh token can mint a new session on a still-enabled
  // account.
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
