// service-accept.ts
// Invitation accept flow — orchestrates Keycloak user creation, user_profile
// upsert, workspace membership, and audit logging.
//
// IMPORTANT: Keycloak user creation is NOT inside the DB transaction.
// If the DB write fails after KC user creation, the orphan KC user ID is
// logged via logger.error for manual remediation — never silently swallowed.

import { randomUUID } from 'node:crypto';

import { logger } from '../../lib/logger.js';
import { createRealmUser } from '../../lib/keycloak-admin-users.js';
import {
  InvitationNotFoundError,
  InvitationExpiredError,
  InvitationAlreadyAcceptedError,
} from '../../lib/app-error.js';
import { writeAuditLog } from '../audit-log/writer.js';

import { findInvitationByToken, markAccepted } from './repository.js';

import type { AcceptInvitationResult, WorkspaceRole } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function d(tenantDb: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tenantDb as any;
}

async function findOrCreateUserProfile(
  tenantDb: unknown,
  email: string,
  realmName: string
): Promise<string> {
  const existing = await d(tenantDb).userProfile.findFirst({
    where: { email },
    select: { userId: true },
  });

  if (existing !== null && existing !== undefined) {
    return existing.userId as string;
  }

  // User does not exist in the tenant — create in Keycloak first.
  // KC creation is outside the transaction; log orphan on DB failure.
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
      { err: String(err), kcUserId, email, realmName },
      'DB write failed after Keycloak user creation — KC user requires manual cleanup'
    );
    throw err;
  }

  return internalUserId;
}

async function ensureWorkspaceMember(
  tenantDb: unknown,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<string> {
  const existing = await d(tenantDb).workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { workspaceId: true },
  });

  if (existing !== null && existing !== undefined) return workspaceId;

  await d(tenantDb).workspaceMember.create({
    data: { workspaceId, userId, role },
  });
  return workspaceId;
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

  await ensureWorkspaceMember(tenantDb, invitation.workspaceId, userId, invitation.role);

  await markAccepted(tenantDb, invitation.id);

  writeAuditLog(tenantDb, {
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
