// repository-templates.ts
// Template-related Prisma queries for the Workspace module.
// Separated from repository.ts to respect the 200-line file limit.

export interface WorkspaceTemplateRow {
  id: string;
  name: string;
  description: string | null;
  structure: unknown;
  isBuiltin: boolean;
  createdBy: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(tenantDb: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tenantDb as any;
}

export async function findTemplates(tenantDb: unknown): Promise<WorkspaceTemplateRow[]> {
  const rows = await db(tenantDb).workspaceTemplate.findMany({
    orderBy: { name: 'asc' },
  });
  return rows as WorkspaceTemplateRow[];
}

export async function findTemplateById(
  tenantDb: unknown,
  id: string
): Promise<WorkspaceTemplateRow | null> {
  const row = await db(tenantDb).workspaceTemplate.findUnique({ where: { id } });
  return row as WorkspaceTemplateRow | null;
}

export async function createTemplate(
  tenantDb: unknown,
  data: {
    name: string;
    description?: string | null;
    structure: unknown[];
    createdBy: string;
  }
): Promise<WorkspaceTemplateRow> {
  const row = await db(tenantDb).workspaceTemplate.create({ data });
  return row as WorkspaceTemplateRow;
}
