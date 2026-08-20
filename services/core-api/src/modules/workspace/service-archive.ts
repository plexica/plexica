// service-archive.ts
// Archive, restore, and reparent business logic for the Workspace module.
// CRUD operations live in service.ts.
//
// ABAC CACHE: these operations deliberately do NOT touch the ABAC membership
// cache. That cache stores `workspace_member` rows, and archive/restore/
// reparent do not modify a single membership — access to an archived workspace
// is refused by the service layer (WorkspaceArchivedError), not by the ABAC
// engine. The previous DEL-based invalidation was therefore pure overhead AND
// a correctness hazard: deleting a key could drop a revocation tombstone
// published by removeMember/removeUser, letting a concurrent ABAC reader
// repopulate the revoked role for a full ABAC_CACHE_TTL_SECONDS. See
// modules/abac/engine.ts § setAbacMembership for the full interleaving.
// `redis` is still accepted by these functions to keep the call signatures
// stable for the routes layer.

import {
  WorkspaceNotFoundError,
  WorkspaceArchivedError,
  CircularReparentError,
  MaxHierarchyDepthError,
  WorkspaceNotArchivedError,
} from '../../lib/app-error.js';
import { writeAuditLog } from '../audit-log/writer.js';

import {
  findWorkspaceById,
  findDescendants,
  archiveWorkspaces,
  restoreWorkspaces,
  updateMaterializedPaths,
} from './repository.js';
import { MAX_DEPTH, pathDepth } from './hierarchy.js';

import type { Redis } from 'ioredis';
import type { ArchiveResult, RestoreResult } from './types.js';
import type { TenantPrismaClient } from '../../lib/tenant-database.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function archiveWorkspaceService(
  tenantDb: TenantPrismaClient,
  workspaceId: string,
  actorId: string,
  _tenantSlug: string,
  _redis: Redis
): Promise<ArchiveResult> {
  const workspace = await findWorkspaceById(tenantDb, workspaceId);
  if (workspace === null) throw new WorkspaceNotFoundError();
  if (workspace.status === 'archived') throw new WorkspaceArchivedError();

  const descendants = await findDescendants(tenantDb, workspace.materializedPath);
  const allIds = [workspaceId, ...descendants.map((d) => d.id)];

  await archiveWorkspaces(tenantDb, allIds);

  await writeAuditLog(tenantDb, {
    actorId,
    actionType: 'workspace.archive',
    targetType: 'workspace',
    targetId: workspaceId,
  });

  return {
    archivedCount: allIds.length,
    workspaces: [
      { id: workspace.id, name: workspace.name },
      ...descendants.map((d) => ({ id: d.id, name: d.name })),
    ],
  };
}

export async function restoreWorkspaceService(
  tenantDb: TenantPrismaClient,
  workspaceId: string,
  actorId: string,
  _tenantSlug: string,
  _redis: Redis
): Promise<RestoreResult> {
  const workspace = await findWorkspaceById(tenantDb, workspaceId);
  if (workspace === null) throw new WorkspaceNotFoundError();
  if (workspace.status !== 'archived') throw new WorkspaceNotArchivedError();

  if (workspace.archivedAt !== null) {
    if (Date.now() > workspace.archivedAt.getTime() + THIRTY_DAYS_MS)
      throw new WorkspaceArchivedError('Restore window expired');
  }

  const descendants = await findDescendants(tenantDb, workspace.materializedPath);
  const archivedDescendants = descendants.filter((d) => d.status === 'archived');
  const allIds = [workspaceId, ...archivedDescendants.map((d) => d.id)];

  await restoreWorkspaces(tenantDb, allIds);

  await writeAuditLog(tenantDb, {
    actorId,
    actionType: 'workspace.restore',
    targetType: 'workspace',
    targetId: workspaceId,
  });

  return {
    restoredCount: allIds.length,
    workspaces: [
      { id: workspace.id, name: workspace.name, status: 'active' },
      ...archivedDescendants.map((d) => ({ id: d.id, name: d.name, status: 'active' })),
    ],
  };
}

export async function reparentWorkspaceService(
  tenantDb: TenantPrismaClient,
  workspaceId: string,
  newParentId: string | null,
  actorId: string,
  _tenantSlug: string,
  _redis: Redis
): Promise<{
  id: string;
  parentId: string | null;
  materializedPath: string;
  descendantsUpdated: number;
}> {
  const workspace = await findWorkspaceById(tenantDb, workspaceId);
  if (workspace === null) throw new WorkspaceNotFoundError();
  if (workspace.status === 'archived') throw new WorkspaceArchivedError();

  const descendants = await findDescendants(tenantDb, workspace.materializedPath);
  const descendantIds = new Set(descendants.map((d) => d.id));

  let newPath: string;
  if (newParentId !== null) {
    if (newParentId === workspaceId || descendantIds.has(newParentId))
      throw new CircularReparentError();
    const newParent = await findWorkspaceById(tenantDb, newParentId);
    if (newParent === null) throw new WorkspaceNotFoundError('New parent workspace not found');
    if (newParent.status === 'archived') throw new WorkspaceArchivedError();
    const parentDepth = pathDepth(newParent.materializedPath);
    const relDepths = descendants.map(
      (d) => pathDepth(d.materializedPath) - pathDepth(workspace.materializedPath)
    );
    const maxRelDepth = relDepths.length > 0 ? Math.max(...relDepths) : 0;
    if (parentDepth + 1 + maxRelDepth > MAX_DEPTH) throw new MaxHierarchyDepthError();
    newPath = `${newParent.materializedPath}/${workspace.slug}`;
  } else {
    newPath = `/${workspace.slug}`;
  }

  const oldPrefix = workspace.materializedPath;
  const updates = [
    { id: workspaceId, materializedPath: newPath },
    ...descendants.map((d) => ({
      id: d.id,
      materializedPath: newPath + d.materializedPath.slice(oldPrefix.length),
    })),
  ];
  await updateMaterializedPaths(tenantDb, updates);

  await writeAuditLog(tenantDb, {
    actorId,
    actionType: 'workspace.reparent',
    targetType: 'workspace',
    targetId: workspaceId,
  });

  return {
    id: workspaceId,
    parentId: newParentId,
    materializedPath: newPath,
    descendantsUpdated: descendants.length,
  };
}
