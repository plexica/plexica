// repository.ts
// Data access functions for the user-management module.
// All functions accept a type-erased Prisma transaction client (unknown → any).

import type { TenantUserDto, UserWorkspacesDto, UserListFilters } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toClient(db: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db as any;
}

function toUserDto(row: {
  userId: string;
  displayName: string | null;
  email: string;
  avatarPath: string | null;
  status: string;
  createdAt: Date;
  _count: { workspaceMembers: number };
}): TenantUserDto {
  return {
    userId: row.userId,
    displayName: row.displayName,
    email: row.email,
    avatarPath: row.avatarPath,
    status: row.status as 'active' | 'invited' | 'disabled',
    workspaceCount: row._count.workspaceMembers,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function findTenantUsers(
  db: unknown,
  filters: UserListFilters
): Promise<{ data: TenantUserDto[]; total: number }> {
  const client = toClient(db);
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { deletedAt: null };

  if (filters.status !== undefined) {
    where['status'] = filters.status;
  }

  if (filters.search !== undefined && filters.search.length > 0) {
    where['displayName'] = { contains: filters.search, mode: 'insensitive' };
  }

  const [rows, total] = await Promise.all([
    client.userProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        displayName: true,
        email: true,
        avatarPath: true,
        status: true,
        createdAt: true,
        _count: { select: { workspaceMembers: true } },
      },
    }) as Promise<
      Array<{
        userId: string;
        displayName: string | null;
        email: string;
        avatarPath: string | null;
        status: string;
        createdAt: Date;
        _count: { workspaceMembers: number };
      }>
    >,
    client.userProfile.count({ where }) as Promise<number>,
  ]);

  return { data: rows.map(toUserDto), total };
}

export async function findUserById(db: unknown, userId: string): Promise<TenantUserDto | null> {
  const client = toClient(db);

  const row = (await client.userProfile.findUnique({
    where: { userId, deletedAt: null },
    select: {
      userId: true,
      displayName: true,
      email: true,
      avatarPath: true,
      status: true,
      createdAt: true,
      _count: { select: { workspaceMembers: true } },
    },
  })) as {
    userId: string;
    displayName: string | null;
    email: string;
    avatarPath: string | null;
    status: string;
    createdAt: Date;
    _count: { workspaceMembers: number };
  } | null;

  return row === null ? null : toUserDto(row);
}

export async function findUserWorkspaces(db: unknown, userId: string): Promise<UserWorkspacesDto> {
  const client = toClient(db);

  const memberships = (await client.workspaceMember.findMany({
    where: { userId },
    select: {
      role: true,
      workspace: { select: { id: true, name: true } },
    },
  })) as Array<{
    role: string;
    workspace: { id: string; name: string };
  }>;

  return {
    userId,
    workspaces: memberships.map((m) => ({
      workspaceId: m.workspace.id,
      workspaceName: m.workspace.name,
      role: m.role,
    })),
  };
}

export async function findUserMemberships(
  db: unknown,
  userId: string
): Promise<Array<{ workspaceId: string; role: string }>> {
  const client = toClient(db);

  const rows = (await client.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true, role: true },
  })) as Array<{ workspaceId: string; role: string }>;

  return rows;
}

export async function findRawProfile(
  db: unknown,
  userId: string
): Promise<{ userId: string; keycloakUserId: string; status: string } | null> {
  const client = toClient(db);

  return (await client.userProfile.findUnique({
    where: { userId },
    select: { userId: true, keycloakUserId: true, status: true },
  })) as { userId: string; keycloakUserId: string; status: string } | null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function softDeleteProfile(db: unknown, userId: string): Promise<void> {
  const client = toClient(db);

  await client.userProfile.update({
    where: { userId },
    data: { deletedAt: new Date(), status: 'disabled' },
  });
}

export async function removeAllMemberships(db: unknown, userId: string): Promise<void> {
  const client = toClient(db);

  await client.workspaceMember.deleteMany({ where: { userId } });
}
