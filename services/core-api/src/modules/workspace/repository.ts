// repository.ts
// Workspace data access layer — Prisma queries scoped to the tenant schema.
// The functions here accept either a plain client or a `$transaction` client
// (TenantDbClient, ADR-028). Archive/restore/path mutations live in
// repository-lifecycle.ts (note that updateMaterializedPaths there does NOT
// accept a transaction client). Template-related functions live in
// repository-templates.ts.

import type { TenantDbClient, TenantPrisma } from '../../lib/tenant-database.js';

export {
  archiveWorkspaces,
  restoreWorkspaces,
  updateMaterializedPaths,
} from './repository-lifecycle.js';

export interface WorkspaceFilters {
  status?: 'active' | 'archived';
  search?: string;
  sort?: 'name' | 'createdAt';
  order?: 'asc' | 'desc';
  page: number;
  pageSize: number;
  userId: string;
  isTenantAdmin: boolean;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  materializedPath: string;
  status: string;
  archivedAt: Date | null;
  templateId: string | null;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  /** Populated by findWorkspacesByUser via Prisma _count select. */
  memberCount?: number;
}

export async function findWorkspacesByUser(
  tenantDb: TenantDbClient,
  filters: WorkspaceFilters
): Promise<{ rows: WorkspaceRow[]; total: number }> {
  const { userId, isTenantAdmin, status, search, sort, order, page, pageSize } = filters;
  const skip = (page - 1) * pageSize;

  const where: TenantPrisma.WorkspaceWhereInput = {};
  if (status !== undefined) where.status = status;
  if (search !== undefined && search.length > 0) {
    where.name = { contains: search, mode: 'insensitive' };
  }
  if (!isTenantAdmin) {
    where.members = { some: { userId } };
  }

  const orderBy: TenantPrisma.WorkspaceOrderByWithRelationInput =
    sort === 'createdAt' ? { createdAt: order ?? 'asc' } : { name: order ?? 'asc' };

  const [rawRows, total] = await Promise.all([
    tenantDb.workspace.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: { _count: { select: { members: true } } },
    }),
    tenantDb.workspace.count({ where }),
  ]);

  // Flatten the Prisma _count result into WorkspaceRow.memberCount
  const rows: WorkspaceRow[] = rawRows.map(({ _count, ...r }) => ({
    ...r,
    memberCount: _count.members,
  }));

  return { rows, total };
}

export async function findWorkspaceById(
  tenantDb: TenantDbClient,
  id: string
): Promise<
  (WorkspaceRow & { children: Array<{ id: string; name: string; slug: string }> }) | null
> {
  return tenantDb.workspace.findUnique({
    where: { id },
    include: {
      children: { select: { id: true, name: true, slug: true } },
    },
  });
}

export async function countWorkspaceMembers(
  tenantDb: TenantDbClient,
  workspaceId: string
): Promise<number> {
  return tenantDb.workspaceMember.count({ where: { workspaceId } });
}

export async function findDescendants(
  tenantDb: TenantDbClient,
  materializedPath: string
): Promise<WorkspaceRow[]> {
  return tenantDb.workspace.findMany({
    where: { materializedPath: { startsWith: materializedPath + '/' } },
  });
}

export async function createWorkspace(
  tenantDb: TenantDbClient,
  data: {
    name: string;
    slug: string;
    description?: string | null;
    parentId?: string | null;
    materializedPath: string;
    templateId?: string | null;
    createdBy: string;
  }
): Promise<WorkspaceRow> {
  return tenantDb.workspace.create({ data });
}

export async function updateWorkspace(
  tenantDb: TenantDbClient,
  id: string,
  data: {
    name?: string | undefined;
    description?: string | null | undefined;
    version?: number | undefined;
  }
): Promise<WorkspaceRow> {
  // Strip undefined fields: exactOptionalPropertyTypes forbids passing them
  // through to the Prisma update input.
  const update: TenantPrisma.WorkspaceUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.description !== undefined) update.description = data.description;
  if (data.version !== undefined) update.version = data.version;
  return tenantDb.workspace.update({ where: { id }, data: update });
}

export async function findMemberRole(
  tenantDb: TenantDbClient,
  workspaceId: string,
  userId: string
): Promise<string | null> {
  const member = await tenantDb.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

export async function slugExists(tenantDb: TenantDbClient, slug: string): Promise<boolean> {
  const row = await tenantDb.workspace.findUnique({ where: { slug }, select: { id: true } });
  return row !== null;
}
