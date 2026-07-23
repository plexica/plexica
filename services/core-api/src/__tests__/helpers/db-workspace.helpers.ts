import { buildTenantClientForCtx } from './db-tenant.helpers.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';

export async function seedWorkspace(
  tenantContext: TenantContext,
  name: string,
  createdBy: string,
  parentId: string | null = null,
  parentPath: string | null = null
): Promise<{ id: string; slug: string; materializedPath: string }> {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const materializedPath = parentPath !== null ? `${parentPath}/${slug}` : `/${slug}`;
  const tenantDb = buildTenantClientForCtx(tenantContext);
  try {
    const row = await tenantDb.workspace.create({
      data: {
        name,
        slug,
        description: null,
        parentId,
        materializedPath,
        status: 'active',
        createdBy,
        version: 1,
      },
      select: { id: true, slug: true, materializedPath: true },
    });
    return row as { id: string; slug: string; materializedPath: string };
  } finally {
    await tenantDb.$disconnect();
  }
}

export async function seedWorkspaceMember(
  tenantContext: TenantContext,
  workspaceId: string,
  userId: string,
  role: 'admin' | 'member' | 'viewer'
): Promise<void> {
  const tenantDb = buildTenantClientForCtx(tenantContext);
  try {
    await tenantDb.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: { workspaceId, userId, role },
      update: { role },
    });
  } finally {
    await tenantDb.$disconnect();
  }
}

export async function wipeTenantWorkspaces(tenantContext: TenantContext): Promise<void> {
  const tenantDb = buildTenantClientForCtx(tenantContext);
  try {
    await tenantDb.auditLog.deleteMany({});
    await tenantDb.invitation.deleteMany({});
    await tenantDb.workspaceMember.deleteMany({});
    await tenantDb.workspace.deleteMany({});
  } finally {
    await tenantDb.$disconnect();
  }
}
