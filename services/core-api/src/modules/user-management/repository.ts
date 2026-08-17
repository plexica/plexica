// repository.ts
// Data access functions for the user-management module.
// All functions accept a type-erased tenant-schema Prisma client (unknown → any).
// That client may be the plain one produced by withTenantDb() (no transaction,
// no atomicity) or an interactive $transaction client — the caller decides.

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

/**
 * Every active (non-deleted) profile's internal userId + Keycloak userId.
 * Used by admin-guard.ts to cross-reference the tenant_admin realm-role
 * holders returned by Keycloak against users who are still active in THIS
 * tenant — a Keycloak role mapping left dangling on a disabled/removed
 * account must not count as a "remaining admin".
 */
export async function findActiveProfileKeycloakIds(
  db: unknown
): Promise<Array<{ userId: string; keycloakUserId: string }>> {
  const client = toClient(db);

  return (await client.userProfile.findMany({
    where: { status: 'active', deletedAt: null },
    select: { userId: true, keycloakUserId: true },
  })) as Array<{ userId: string; keycloakUserId: string }>;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
// Write-side operations live in repository-mutations.ts (constitution Rule 4 —
// 200-line limit). Re-exported here so callers keep a single import site.

export { softDeleteProfile, removeAllMemberships, lockTenantAdminRemoval } from './repository-mutations.js';
