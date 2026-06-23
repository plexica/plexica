// repository.ts
// Data access layer for the workspace-member module.
// Uses type-erased Prisma client (db as any) — tenant schema.
// Implements: WS-003 (Workspace Member Management)

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
  db: unknown,
  workspaceId: string,
  filters: MemberListFilters
): Promise<{ data: WorkspaceMemberDto[]; total: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repo = (db as any).workspaceMember;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { workspaceId };

  if (filters.search) {
    where['user'] = {
      displayName: { contains: filters.search, mode: 'insensitive' },
    };
  }

  const [rows, total] = await Promise.all([
    repo.findMany({
      where,
      include: { user: { select: { displayName: true, avatarPath: true } } },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    }),
    repo.count({ where }),
  ]);

  return { data: (rows as Parameters<typeof toDto>[0][]).map(toDto), total };
}

export async function findMember(
  db: unknown,
  workspaceId: string,
  userId: string
): Promise<WorkspaceMemberDto | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).workspaceMember.findFirst({
    where: { workspaceId, userId },
    include: { user: { select: { displayName: true, avatarPath: true } } },
  });
  return row ? toDto(row) : null;
}

export async function addMember(
  db: unknown,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<WorkspaceMemberDto> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).workspaceMember.create({
    data: { workspaceId, userId, role },
    include: { user: { select: { displayName: true, avatarPath: true } } },
  });
  return toDto(row);
}

export async function removeMember(
  db: unknown,
  workspaceId: string,
  userId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).workspaceMember.deleteMany({
    where: { workspaceId, userId },
  });
}

export async function changeMemberRole(
  db: unknown,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<WorkspaceMemberDto> {
  // updateMany does not return records — use update on the unique constraint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId } },
    data: { role },
    include: { user: { select: { displayName: true, avatarPath: true } } },
  });
  return toDto(row);
}
