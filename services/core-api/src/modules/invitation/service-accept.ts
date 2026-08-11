// service-accept.ts
// Invitation accept flow — orchestrates Keycloak user creation, user_profile
// upsert, workspace membership, and audit logging.
//
// IMPORTANT: this flow runs on the plain client handed out by withTenantDb(),
// which does NOT open a transaction — every write below commits on its own.
// Keycloak user creation therefore has no DB transaction to roll back: if a DB
// write fails after KC user creation, the orphan KC user ID is logged via
// logger.error for manual remediation — never silently swallowed.

import { randomUUID } from 'node:crypto';

import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import { createRealmUser } from '../../lib/keycloak-admin-users.js';
import {
  InvitationNotFoundError,
  InvitationExpiredError,
  InvitationAlreadyAcceptedError,
} from '../../lib/app-error.js';
import { setAbacMembership } from '../abac/engine.js';
import { writeAuditLog } from '../audit-log/writer.js';

import { findInvitationByToken, markAccepted } from './repository.js';

import type { AcceptInvitationResult, WorkspaceRole } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function d(tenantDb: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tenantDb as any;
}

/**
 * Inverse of lib/tenant-schema-helpers.ts `toRealmName()` (`plexica-<slug>`).
 *
 * The public accept route is unauthenticated and hands this service only the
 * realm name; AsyncLocalStorage does not propagate from a Fastify preHandler
 * into the route handler, so the tenant slug cannot be read from the context
 * store here. Returns null when the realm does not follow the convention — the
 * ABAC write-through is then skipped rather than writing under a wrong key.
 */
const REALM_PREFIX = 'plexica-';

function tenantSlugFromRealm(realmName: string): string | null {
  if (!realmName.startsWith(REALM_PREFIX)) return null;
  const slug = realmName.slice(REALM_PREFIX.length);
  return slug.length > 0 ? slug : null;
}

async function findOrCreateUserProfile(
  tenantDb: unknown,
  email: string,
  realmName: string
): Promise<string> {
  const existing = await d(tenantDb).userProfile.findFirst({
    where: { email },
    select: { userId: true, deletedAt: true },
  });

  if (existing !== null && existing !== undefined) {
    // A previously removed user can legitimately be re-invited. Reactivating
    // the row keeps the profile resolvable by user-profile-resolver.ts, which
    // refuses soft-deleted profiles. NOTE: the Keycloak account disabled by
    // removeUser() is NOT re-enabled here — an administrator must do that
    // before the invitee can authenticate again.
    if (existing.deletedAt !== null) {
      await d(tenantDb).userProfile.update({
        where: { userId: existing.userId },
        data: { deletedAt: null, status: 'invited' },
      });
      logger.info({ realmName }, 'Reactivated a soft-deleted profile on invitation accept');
    }
    return existing.userId as string;
  }

  // User does not exist in the tenant — create in Keycloak first.
  // No DB transaction wraps this call site; log orphan on DB failure.
  // Require UPDATE_PASSWORD so the account cannot be used until the user sets a password.
  const { userId: kcUserId } = await createRealmUser(realmName, email, '', ['UPDATE_PASSWORD']);

  const internalUserId = randomUUID();
  try {
    await d(tenantDb).userProfile.create({
      data: {
        userId: internalUserId,
        keycloakUserId: kcUserId,
        email,
        status: 'invited',
      },
    });
  } catch (err: unknown) {
    logger.error(
      { kcUserId, realmName },
      'DB write failed after Keycloak user creation — KC user requires manual cleanup'
    );
    throw err;
  }

  return internalUserId;
}

/**
 * Creates the workspace_member row if it does not exist and returns the role
 * that is in effect afterwards (the pre-existing role wins when the row was
 * already there — nothing was written, so nothing new must be published).
 */
async function ensureWorkspaceMember(
  tenantDb: unknown,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<WorkspaceRole> {
  const existing = await d(tenantDb).workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });

  if (existing !== null && existing !== undefined) return existing.role as WorkspaceRole;

  await d(tenantDb).workspaceMember.create({
    data: { workspaceId, userId, role },
  });
  return role;
}

/**
 * Publishes the post-accept membership into the ABAC cache.
 *
 * This path creates the workspace_member row directly instead of going through
 * workspace-member/service.ts `addMember()`, so without this call it would skip
 * the write-through entirely. That matters because the ABAC populate uses
 * `SET … NX`: if the invitee had already hit an ABAC-gated route for this
 * workspace the cache holds `{role: null}`, and NOTHING would overwrite it —
 * the brand new member would be denied for up to ABAC_CACHE_TTL_SECONDS.
 *
 * Best-effort but logged: a Redis failure must not fail an otherwise successful
 * acceptance. Worst case the invitee waits out the TTL.
 */
async function publishMembership(
  realmName: string,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<void> {
  const tenantSlug = tenantSlugFromRealm(realmName);
  if (tenantSlug === null) {
    logger.warn({ realmName }, 'Cannot derive tenant slug from realm — ABAC write-through skipped');
    return;
  }

  await setAbacMembership(tenantSlug, userId, workspaceId, { role }, redis).catch((err: unknown) => {
    logger.warn(
      { err: String(err), workspaceId, tenantSlug },
      'ABAC write-through failed on invitation accept — access may be denied until TTL expiry'
    );
  });
}

export async function acceptInvitationService(
  tenantDb: unknown,
  token: string,
  realmName: string
): Promise<AcceptInvitationResult> {
  const invitation = await findInvitationByToken(tenantDb, token);
  if (invitation === null) throw new InvitationNotFoundError();
  if (invitation.status === 'accepted') throw new InvitationAlreadyAcceptedError();
  if (new Date(invitation.expiresAt) < new Date()) throw new InvitationExpiredError();

  const userId = await findOrCreateUserProfile(tenantDb, invitation.email, realmName);

  const effectiveRole = await ensureWorkspaceMember(
    tenantDb,
    invitation.workspaceId,
    userId,
    invitation.role
  );

  await publishMembership(realmName, invitation.workspaceId, userId, effectiveRole);

  await markAccepted(tenantDb, invitation.id);

  await writeAuditLog(tenantDb, {
    actorId: userId,
    actionType: 'invitation.accept',
    targetType: 'invitation',
    targetId: invitation.id,
  });

  const workspace = await d(tenantDb).workspace.findUnique({
    where: { id: invitation.workspaceId },
    select: { id: true, name: true },
  });

  return {
    workspaceId: invitation.workspaceId,
    workspaceName: (workspace?.name as string | undefined) ?? '',
    role: invitation.role,
  };
}
