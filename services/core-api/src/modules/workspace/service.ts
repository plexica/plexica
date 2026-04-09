// service.ts
// Workspace CRUD business logic — list, create, get, update.
// Archive/restore/reparent live in service-archive.ts.

import { generateSlug } from '../../lib/slug.js';
import {
  WorkspaceNotFoundError,
  WorkspaceArchivedError,
  MaxHierarchyDepthError,
  VersionConflictError,
} from '../../lib/app-error.js';
import { buildPaginatedResult } from '../../lib/pagination.js';
import { writeAuditLog } from '../audit-log/writer.js';

import {
  findWorkspacesByUser,
  findWorkspaceById,
  countWorkspaceMembers,
  createWorkspace,
  updateWorkspace,
  findMemberRole,
  slugExists,
} from './repository.js';
import { findTemplateById } from './repository-templates.js';

import type {
  WorkspaceDto,
  WorkspaceDetailDto,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from './types.js';
import type { PaginatedResult } from '../../lib/pagination.js';

const MAX_DEPTH = 10;

function pathDepth(p: string): number {
  return p.split('/').filter(Boolean).length;
}

async function resolveSlug(tenantDb: unknown, baseName: string): Promise<string> {
  let slug = generateSlug(baseName);
  let suffix = 2;
  while (await slugExists(tenantDb, slug)) {
    slug = `${generateSlug(baseName)}-${suffix}`;
    suffix++;
  }
  return slug;
}

export async function listWorkspaces(
  tenantDb: unknown,
  userId: string,
  isTenantAdmin: boolean,
  filters: {
    status?: 'active' | 'archived';
    search?: string;
    sort?: 'name' | 'createdAt';
    order?: 'asc' | 'desc';
    page: number;
    limit: number;
  }
): Promise<PaginatedResult<WorkspaceDto>> {
  const { rows, total } = await findWorkspacesByUser(tenantDb, {
    ...filters,
    userId,
    isTenantAdmin,
  });
  const dtos: WorkspaceDto[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parentId,
    materializedPath: row.materializedPath,
    status: row.status as 'active' | 'archived',
    memberCount: row.memberCount ?? 0,
    createdAt: row.createdAt.toISOString(),
  }));
  return buildPaginatedResult(dtos, total, { page: filters.page, limit: filters.limit });
}

async function seedTemplateChildren(
  tenantDb: unknown,
  templateId: string,
  parentId: string,
  parentPath: string,
  userId: string
): Promise<void> {
  const template = await findTemplateById(tenantDb, templateId);
  if (template === null) return;
  const structure = Array.isArray(template.structure) ? template.structure : [];
  for (const child of structure as Array<{ name: string; description?: string }>) {
    const childSlug = await resolveSlug(tenantDb, child.name);
    await createWorkspace(tenantDb, {
      name: child.name,
      slug: childSlug,
      description: child.description ?? null,
      parentId,
      materializedPath: `${parentPath}/${childSlug}`,
      createdBy: userId,
    });
  }
}

export async function createWorkspaceService(
  tenantDb: unknown,
  userId: string,
  input: CreateWorkspaceInput
): Promise<WorkspaceDetailDto> {
  let parentPath: string | null = null;
  if (input.parentId != null) {
    const parent = await findWorkspaceById(tenantDb, input.parentId);
    if (parent === null) throw new WorkspaceNotFoundError('Parent workspace not found');
    if (parent.status === 'archived') throw new WorkspaceArchivedError();
    if (pathDepth(parent.materializedPath) >= MAX_DEPTH) throw new MaxHierarchyDepthError();
    parentPath = parent.materializedPath;
  }
  const slug = await resolveSlug(tenantDb, input.name);
  const path = parentPath != null ? `${parentPath}/${slug}` : `/${slug}`;
  const created = await createWorkspace(tenantDb, {
    name: input.name,
    slug,
    description: input.description ?? null,
    parentId: input.parentId ?? null,
    materializedPath: path,
    templateId: input.templateId ?? null,
    createdBy: userId,
  });
  if (input.templateId != null) {
    await seedTemplateChildren(tenantDb, input.templateId, created.id, path, userId);
  }
  writeAuditLog(tenantDb, {
    actorId: userId,
    actionType: 'workspace.create',
    targetType: 'workspace',
    targetId: created.id,
  });
  return getWorkspaceService(tenantDb, created.id, userId);
}

export async function getWorkspaceService(
  tenantDb: unknown,
  workspaceId: string,
  userId: string
): Promise<WorkspaceDetailDto> {
  const row = await findWorkspaceById(tenantDb, workspaceId);
  if (row === null) throw new WorkspaceNotFoundError();
  const [memberCount, currentUserRole] = await Promise.all([
    countWorkspaceMembers(tenantDb, workspaceId),
    findMemberRole(tenantDb, workspaceId, userId),
  ]);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parentId,
    materializedPath: row.materializedPath,
    status: row.status as 'active' | 'archived',
    memberCount,
    createdAt: row.createdAt.toISOString(),
    children: row.children,
    currentUserRole,
    templateId: row.templateId,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateWorkspaceService(
  tenantDb: unknown,
  workspaceId: string,
  userId: string,
  input: UpdateWorkspaceInput,
  ifMatchVersion?: number
): Promise<WorkspaceDetailDto> {
  const existing = await findWorkspaceById(tenantDb, workspaceId);
  if (existing === null) throw new WorkspaceNotFoundError();
  if (existing.status === 'archived') throw new WorkspaceArchivedError();
  if (ifMatchVersion !== undefined && existing.version !== ifMatchVersion) {
    throw new VersionConflictError();
  }
  await updateWorkspace(tenantDb, workspaceId, { ...input, version: existing.version + 1 });
  writeAuditLog(tenantDb, {
    actorId: userId,
    actionType: 'workspace.update',
    targetType: 'workspace',
    targetId: workspaceId,
  });
  return getWorkspaceService(tenantDb, workspaceId, userId);
}
