// repository.ts
// Data access functions for the user-management module.
// All functions accept a tenant-schema Prisma client (TenantDbClient, ADR-028):
// either the plain one produced by withTenantDb() (no transaction, no
// atomicity) or an interactive $transaction client — the caller decides.

import type { TenantDbClient, TenantPrisma } from '../../lib/tenant-database.js';
import type { TenantUserDto, UserWorkspacesDto, UserListFilters } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  db: TenantDbClient,
  filters: UserListFilters
): Promise<{ data: TenantUserDto[]; total: number }> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: TenantPrisma.UserProfileWhereInput = { deletedAt: null };

  if (filters.status !== undefined) {
    where.status = filters.status;
  }

  if (filters.search !== undefined && filters.search.length > 0) {
    where.displayName = { contains: filters.search, mode: 'insensitive' };
  }

  const [rows, total] = await Promise.all([
    db.userProfile.findMany({
      where,
      skip,
      take: pageSize,
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
    }),
    db.userProfile.count({ where }),
  ]);

  return { data: rows.map(toUserDto), total };
}

export async function findUserWorkspaces(
  db: TenantDbClient,
  userId: string
): Promise<UserWorkspacesDto> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    select: {
      role: true,
      workspace: { select: { id: true, name: true } },
    },
  });

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
  db: TenantDbClient,
  userId: string
): Promise<{ userId: string; keycloakUserId: string; status: string } | null> {
  return db.userProfile.findUnique({
    where: { userId },
    select: { userId: true, keycloakUserId: true, status: true },
  });
}

/**
 * Every active (non-deleted) profile's internal userId + Keycloak userId.
 * Used by admin-guard.ts to cross-reference the tenant_admin realm-role
 * holders returned by Keycloak against users who are still active in THIS
 * tenant — a Keycloak role mapping left dangling on a disabled/removed
 * account must not count as a "remaining admin".
 */
export async function findActiveProfileKeycloakIds(
  db: TenantDbClient
): Promise<Array<{ userId: string; keycloakUserId: string }>> {
  return db.userProfile.findMany({
    where: { status: 'active', deletedAt: null },
    select: { userId: true, keycloakUserId: true },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
// Write-side operations live in repository-mutations.ts (constitution Rule 4 —
// 200-line limit). Re-exported here so callers keep a single import site.

export { softDeleteProfile, removeAllMemberships, lockTenantAdminRemoval } from './repository-mutations.js';
