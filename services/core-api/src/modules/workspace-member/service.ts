// service.ts
// Business logic for the workspace-member module.
// Reusable by the invitation service (Phase 6) for acceptance flows.
// Implements: WS-003 (Workspace Member Management)

import { redis } from '../../lib/redis.js';
import { MemberAlreadyExistsError, MemberNotFoundError } from '../../lib/app-error.js';
import { setAbacMembership } from '../../middleware/abac.js';
import { writeAuditLog } from '../audit-log/writer.js';

import {
  findMember,
  findMembers,
  addMember as repoAdd,
  removeMember as repoRemove,
  changeMemberRole as repoChangeRole,
} from './repository.js';

import type { TenantDbClient, TenantPrismaClient } from '../../lib/tenant-database.js';
import type { PaginatedResult } from '../../lib/pagination.js';
import type { MemberListFilters, WorkspaceMemberDto, WorkspaceRole } from './types.js';

// ---------------------------------------------------------------------------
// listMembers
// ---------------------------------------------------------------------------

export async function listMembers(
  tenantDb: TenantDbClient,
  workspaceId: string,
  filters: MemberListFilters
): Promise<PaginatedResult<WorkspaceMemberDto>> {
  return findMembers(tenantDb, workspaceId, filters);
}

// ---------------------------------------------------------------------------
// addMember — also called by invitation service on accept
// TenantPrismaClient (non-transactional): writes the audit log.
// ---------------------------------------------------------------------------

export async function addMember(
  tenantDb: TenantPrismaClient,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
  actorId: string,
  tenantSlug: string
): Promise<WorkspaceMemberDto> {
  const existing = await findMember(tenantDb, workspaceId, userId);
  if (existing !== null) {
    throw new MemberAlreadyExistsError();
  }

  const member = await repoAdd(tenantDb, workspaceId, userId, role);

  // Write-through: publish the new role instead of deleting the key, so a
  // concurrent ABAC reader holding the pre-mutation DB state cannot repopulate
  // the cache with it. See setAbacMembership() / getMembership().
  await setAbacMembership(tenantSlug, userId, workspaceId, { role, isTenantAdmin: false }, redis);

  await writeAuditLog(tenantDb, {
    actorId,
    actionType: 'member.add',
    targetType: 'workspace_member',
    targetId: member.id,
  });

  return member;
}

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

// TenantPrismaClient (non-transactional): writes the audit log.
export async function removeMember(
  tenantDb: TenantPrismaClient,
  workspaceId: string,
  userId: string,
  actorId: string,
  tenantSlug: string
): Promise<void> {
  const existing = await findMember(tenantDb, workspaceId, userId);
  if (existing === null) {
    throw new MemberNotFoundError();
  }

  await repoRemove(tenantDb, workspaceId, userId);

  // Write-through with role: null (= not a member). A plain delete would let a
  // reader that already read the pre-DELETE row republish the revoked role for
  // a full ABAC_CACHE_TTL_SECONDS.
  await setAbacMembership(
    tenantSlug,
    userId,
    workspaceId,
    { role: null, isTenantAdmin: false },
    redis
  );

  await writeAuditLog(tenantDb, {
    actorId,
    actionType: 'member.remove',
    targetType: 'workspace_member',
    targetId: existing.id,
  });
}

// ---------------------------------------------------------------------------
// changeMemberRole
// ---------------------------------------------------------------------------

// TenantPrismaClient (non-transactional): writes the audit log.
export async function changeMemberRole(
  tenantDb: TenantPrismaClient,
  workspaceId: string,
  userId: string,
  newRole: WorkspaceRole,
  actorId: string,
  tenantSlug: string
): Promise<WorkspaceMemberDto> {
  const existing = await findMember(tenantDb, workspaceId, userId);
  if (existing === null) {
    throw new MemberNotFoundError();
  }

  const updated = await repoChangeRole(tenantDb, workspaceId, userId, newRole);

  // Write-through: a downgrade must take effect immediately, not after the TTL.
  await setAbacMembership(
    tenantSlug,
    userId,
    workspaceId,
    { role: newRole, isTenantAdmin: false },
    redis
  );

  await writeAuditLog(tenantDb, {
    actorId,
    actionType: 'member.role_change',
    targetType: 'workspace_member',
    targetId: updated.id,
    beforeValue: { role: existing.role },
    afterValue: { role: newRole },
  });

  return updated;
}
