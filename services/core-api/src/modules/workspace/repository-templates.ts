// repository-templates.ts
// Template-related Prisma queries for the Workspace module.
// Separated from repository.ts to respect the 200-line file limit.

import type { TenantDbClient, TenantPrisma } from '../../lib/tenant-database.js';

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

export async function findTemplates(tenantDb: TenantDbClient): Promise<WorkspaceTemplateRow[]> {
  return tenantDb.workspaceTemplate.findMany({
    orderBy: { name: 'asc' },
  });
}

export async function findTemplateById(
  tenantDb: TenantDbClient,
  id: string
): Promise<WorkspaceTemplateRow | null> {
  return tenantDb.workspaceTemplate.findUnique({ where: { id } });
}

export async function createTemplate(
  tenantDb: TenantDbClient,
  data: {
    name: string;
    description?: string | null;
    structure: unknown[];
    createdBy: string;
  }
): Promise<WorkspaceTemplateRow> {
  return tenantDb.workspaceTemplate.create({
    data: { ...data, structure: data.structure as unknown as TenantPrisma.InputJsonValue },
  });
}
