import {
  WorkspaceNotFoundError,
  WorkspaceArchivedError,
  MaxHierarchyDepthError,
  VersionConflictError,
} from '../../lib/app-error.js';
import { buildPaginatedResult } from '../../lib/pagination.js';
import { writeAuditLog } from '../audit-log/writer.js';
import { buildDomainEvent } from '../../events/event-envelope.js';
import { enqueueEvent } from '../../events/outbox-repository.js';

import {
  findWorkspacesByUser,
  findWorkspaceById,
  countWorkspaceMembers,
  createWorkspace,
  updateWorkspace,
  findMemberRole,
} from './repository.js';
import { buildWorkspaceCreateAuditEntry } from './audit-entries.js';
import {
  MAX_DEPTH,
  pathDepth,
  resolveSlug,
  seedTemplateChildren,
} from './service-create-helpers.js';

import type { CreateWorkspaceResult } from './audit-entries.js';
import type {
  WorkspaceDto,
  WorkspaceDetailDto,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from './types.js';
import type { PaginatedResult } from '../../lib/pagination.js';

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

/**
 * Creates a workspace and its outbox event.
 *
 * Runs inside an interactive `$transaction`, so it deliberately does NOT write
 * the audit log: a swallowed audit INSERT failure would still abort the
 * transaction in PostgreSQL. The pending entry is returned to the caller, which
 * persists it on a non-transactional client after COMMIT.
 */
export async function createWorkspaceService(
  tenantDb: unknown,
  userId: string,
  input: CreateWorkspaceInput,
  tenantId: string
): Promise<CreateWorkspaceResult> {
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
  await enqueueEvent(
    tenantDb as Parameters<typeof enqueueEvent>[0],
    'plexica.workspace.created',
    buildDomainEvent({
      type: 'plexica.workspace.created',
      tenantId,
      producer: { kind: 'core', id: 'core' },
      payload: { id: created.id, workspaceId: created.id, slug, name: input.name },
    })
  );
  return {
    workspace: await getWorkspaceService(tenantDb, created.id, userId),
    auditEntry: buildWorkspaceCreateAuditEntry(userId, created.id),
  };
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
  // Safe: this service is invoked on a plain `withTenantDb` client, never
  // inside an interactive $transaction — see audit-log/writer.ts.
  await writeAuditLog(tenantDb, {
    actorId: userId,
    actionType: 'workspace.update',
    targetType: 'workspace',
    targetId: workspaceId,
  });
  return getWorkspaceService(tenantDb, workspaceId, userId);
}
