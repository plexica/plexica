// repository.ts
// Data access layer for the workspace-member module.
// Tenant-schema Prisma client (TenantDbClient, ADR-028).
// Implements: WS-003 (Workspace Member Management)

import type { TenantDbClient, TenantPrisma } from '../../lib/tenant-database.js';
import type { MemberListFilters, WorkspaceMemberDto, WorkspaceRole } from './types.js';

// ---------------------------------------------------------------------------
// Internal mapper
// ---------------------------------------------------------------------------

function toDto(row: {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: Date;
  user?: { displayName?: string | null; avatarPath?: string | null } | null;
}): WorkspaceMemberDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    displayName: row.user?.displayName ?? null,
    avatarPath: row.user?.avatarPath ?? null,
    role: row.role as WorkspaceRole,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function findMembers(
  db: TenantDbClient,
  workspaceId: string,
  filters: MemberListFilters
): Promise<{ data: WorkspaceMemberDto[]; total: number }> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: TenantPrisma.WorkspaceMemberWhereInput = { workspaceId };

  if (filters.search) {
    where.user = {
      displayName: { contains: filters.search, mode: 'insensitive' },
    };
  }

  const [rows, total] = await Promise.all([
    db.workspaceMember.findMany({
      where,
      include: { user: { select: { displayName: true, avatarPath: true } } },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    }),
    db.workspaceMember.count({ where }),
  ]);

  return { data: rows.map(toDto), total };
}

export async function findMember(
  db: TenantDbClient,
  workspaceId: string,
  userId: string
): Promise<WorkspaceMemberDto | null> {
  const row = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
    include: { user: { select: { displayName: true, avatarPath: true } } },
  });
  return row ? toDto(row) : null;
}

export async function addMember(
  db: TenantDbClient,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<WorkspaceMemberDto> {
  const row = await db.workspaceMember.create({
    data: { workspaceId, userId, role },
    include: { user: { select: { displayName: true, avatarPath: true } } },
  });
  return toDto(row);
}

export async function removeMember(
  db: TenantDbClient,
  workspaceId: string,
  userId: string
): Promise<void> {
  await db.workspaceMember.deleteMany({
    where: { workspaceId, userId },
  });
}

export async function changeMemberRole(
  db: TenantDbClient,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<WorkspaceMemberDto> {
  // updateMany does not return records — use update on the unique constraint
  const row = await db.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId } },
    data: { role },
    include: { user: { select: { displayName: true, avatarPath: true } } },
  });
  return toDto(row);
}
