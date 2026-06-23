// service.ts
// Business logic for the workspace-member module.
// Reusable by the invitation service (Phase 6) for acceptance flows.
// Implements: WS-003 (Workspace Member Management)

import { redis } from '../../lib/redis.js';
import { MemberAlreadyExistsError, MemberNotFoundError } from '../../lib/app-error.js';
import { invalidateAbacCache } from '../../middleware/abac.js';
import { writeAuditLog } from '../audit-log/writer.js';

import {
  findMember,
  findMembers,
  addMember as repoAdd,
  removeMember as repoRemove,
  changeMemberRole as repoChangeRole,
} from './repository.js';

import type { MemberListFilters, WorkspaceMemberDto, WorkspaceRole } from './types.js';

// ---------------------------------------------------------------------------
// listMembers
// ---------------------------------------------------------------------------

export async function listMembers(
  tenantDb: unknown,
  workspaceId: string,
  filters: MemberListFilters
): Promise<{ data: WorkspaceMemberDto[]; total: number }> {
  return findMembers(tenantDb, workspaceId, filters);
}

// ---------------------------------------------------------------------------
// addMember — also called by invitation service on accept
// ---------------------------------------------------------------------------

export async function addMember(
  tenantDb: unknown,
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

  await invalidateAbacCache(tenantSlug, userId, workspaceId, redis);

  writeAuditLog(tenantDb, {
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

export async function removeMember(
  tenantDb: unknown,
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

  await invalidateAbacCache(tenantSlug, userId, workspaceId, redis);

  writeAuditLog(tenantDb, {
    actorId,
    actionType: 'member.remove',
    targetType: 'workspace_member',
    targetId: existing.id,
  });
}

// ---------------------------------------------------------------------------
// changeMemberRole
// ---------------------------------------------------------------------------

export async function changeMemberRole(
  tenantDb: unknown,
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

  await invalidateAbacCache(tenantSlug, userId, workspaceId, redis);

  writeAuditLog(tenantDb, {
    actorId,
    actionType: 'member.role_change',
    targetType: 'workspace_member',
    targetId: updated.id,
    beforeValue: { role: existing.role },
    afterValue: { role: newRole },
  });

  return updated;
}
