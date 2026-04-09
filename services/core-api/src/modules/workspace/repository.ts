// repository.ts
// Workspace data access layer — Prisma queries scoped to the tenant schema.
// All functions accept `db: unknown` and cast internally (type-erased pending prisma generate).
// Template-related functions live in repository-templates.ts.

export interface WorkspaceFilters {
  status?: 'active' | 'archived';
  search?: string;
  sort?: 'name' | 'createdAt';
  order?: 'asc' | 'desc';
  page: number;
  limit: number;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(tenantDb: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tenantDb as any;
}

export async function findWorkspacesByUser(
  tenantDb: unknown,
  filters: WorkspaceFilters
): Promise<{ rows: WorkspaceRow[]; total: number }> {
  const { userId, isTenantAdmin, status, search, sort, order, page, limit } = filters;
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  if (status !== undefined) where['status'] = status;
  if (search !== undefined && search.length > 0) {
    where['name'] = { contains: search, mode: 'insensitive' };
  }
  if (!isTenantAdmin) {
    where['members'] = { some: { userId } };
  }

  const orderBy = { [sort ?? 'name']: order ?? 'asc' };

  const [rawRows, total] = await Promise.all([
    db(tenantDb).workspace.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: { _count: { select: { members: true } } },
    }),
    db(tenantDb).workspace.count({ where }),
  ]);

  // Flatten the Prisma _count result into WorkspaceRow.memberCount
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (rawRows as any[]).map((r: any) => ({
    ...r,
    memberCount: r._count?.members ?? 0,
  })) as WorkspaceRow[];

  return { rows, total };
}

export async function findWorkspaceById(
  tenantDb: unknown,
  id: string
): Promise<
  (WorkspaceRow & { children: Array<{ id: string; name: string; slug: string }> }) | null
> {
  const row = await db(tenantDb).workspace.findUnique({
    where: { id },
    include: {
      children: { select: { id: true, name: true, slug: true } },
    },
  });
  return row as
    | (WorkspaceRow & { children: Array<{ id: string; name: string; slug: string }> })
    | null;
}

export async function countWorkspaceMembers(
  tenantDb: unknown,
  workspaceId: string
): Promise<number> {
  return db(tenantDb).workspaceMember.count({ where: { workspaceId } });
}

export async function findDescendants(
  tenantDb: unknown,
  materializedPath: string
): Promise<WorkspaceRow[]> {
  const rows = await db(tenantDb).workspace.findMany({
    where: { materializedPath: { startsWith: materializedPath + '/' } },
  });
  return rows as WorkspaceRow[];
}

export async function findWorkspacesByIds(
  tenantDb: unknown,
  ids: string[]
): Promise<WorkspaceRow[]> {
  const rows = await db(tenantDb).workspace.findMany({ where: { id: { in: ids } } });
  return rows as WorkspaceRow[];
}

export async function createWorkspace(
  tenantDb: unknown,
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
  const row = await db(tenantDb).workspace.create({ data });
  return row as WorkspaceRow;
}

export async function updateWorkspace(
  tenantDb: unknown,
  id: string,
  data: {
    name?: string | undefined;
    description?: string | null | undefined;
    version?: number | undefined;
  }
): Promise<WorkspaceRow> {
  const row = await db(tenantDb).workspace.update({ where: { id }, data });
  return row as WorkspaceRow;
}

export async function archiveWorkspaces(tenantDb: unknown, ids: string[]): Promise<void> {
  await db(tenantDb).workspace.updateMany({
    where: { id: { in: ids } },
    data: { status: 'archived', archivedAt: new Date() },
  });
}

export async function restoreWorkspaces(tenantDb: unknown, ids: string[]): Promise<void> {
  await db(tenantDb).workspace.updateMany({
    where: { id: { in: ids } },
    data: { status: 'active', archivedAt: null },
  });
}

export async function updateMaterializedPaths(
  tenantDb: unknown,
  updates: Array<{ id: string; materializedPath: string }>
): Promise<void> {
  await db(tenantDb).$transaction(
    updates.map((u) =>
      db(tenantDb).workspace.update({
        where: { id: u.id },
        data: { materializedPath: u.materializedPath },
      })
    )
  );
}

export async function findMemberRole(
  tenantDb: unknown,
  workspaceId: string,
  userId: string
): Promise<string | null> {
  const member = await db(tenantDb).workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return (member?.role as string | null | undefined) ?? null;
}

export async function slugExists(tenantDb: unknown, slug: string): Promise<boolean> {
  const row = await db(tenantDb).workspace.findUnique({ where: { slug }, select: { id: true } });
  return row !== null;
}
