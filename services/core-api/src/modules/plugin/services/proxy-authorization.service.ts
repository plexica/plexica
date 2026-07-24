import { ForbiddenError } from '../../../lib/app-error.js';
import { redis } from '../../../lib/redis.js';
import { withCoreDb, withTenantDb } from '../../../lib/tenant-database.js';
import { evaluate } from '../../abac/engine.js';
import { PluginNotFoundError, WorkspaceVerifyError } from '../errors.js';

import { isPluginVisible } from './visibility.service.js';

import type { TenantContext } from '../../../lib/tenant-context-store.js';
import type { AbacContext, WorkspaceRole } from '../../abac/types.js';

interface ProxyAuthorizationInput {
  installId: string;
  workspaceId: string;
  userId: string;
  isTenantAdmin: boolean;
  tenantContext: TenantContext;
}

export interface AuthorizedPluginProxy {
  hostingType: string;
  pluginSlug: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
}

function checkedRole(role: string): WorkspaceRole {
  if (role === 'admin' || role === 'member' || role === 'viewer') return role;
  throw new WorkspaceVerifyError();
}

export async function authorizePluginProxy(
  input: ProxyAuthorizationInput
): Promise<AuthorizedPluginProxy> {
  const tenant = await withCoreDb((db) =>
    db.tenant.findUnique({
      where: { id: input.tenantContext.tenantId },
      select: { slug: true, status: true },
    })
  );
  if (
    !tenant ||
    tenant.slug !== input.tenantContext.slug ||
    tenant.status !== 'active'
  ) {
    throw new ForbiddenError('Tenant is not active');
  }

  return withTenantDb(async (db) => {
    const installation = await db.pluginInstallation.findFirst({
      where: {
        id: input.installId,
        tenantSlug: input.tenantContext.slug,
        status: 'active',
      },
      select: { hostingType: true, pluginId: true },
    });
    if (!installation) throw new PluginNotFoundError(`Installation ${input.installId}`);

    const workspace = await db.workspace.findFirst({
      where: { id: input.workspaceId, status: 'active' },
      select: { id: true },
    });
    if (!workspace) throw new ForbiddenError('Active workspace is required for plugin access');

    let workspaceRole: WorkspaceRole = 'admin';
    if (!input.isTenantAdmin) {
      const membership = await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: input.workspaceId,
            userId: input.userId,
          },
        },
        select: { role: true },
      });
      if (!membership) throw new ForbiddenError('Workspace membership is required for plugin access');
      workspaceRole = checkedRole(membership.role);
    }

    if (!(await isPluginVisible(db as never, input.installId, input.workspaceId))) {
      throw new ForbiddenError('Plugin is not available in this workspace');
    }

    const plugin = await withCoreDb((coreDb) =>
      coreDb.plugin.findUnique({
        where: { id: installation.pluginId },
        select: { slug: true },
      })
    );
    if (!plugin) throw new PluginNotFoundError(`Installation ${input.installId}`);

    const action = `${plugin.slug}:access`;
    if (!input.isTenantAdmin) {
      const abacContext: AbacContext = {
        userId: input.userId,
        workspaceId: input.workspaceId,
        tenantSlug: input.tenantContext.slug,
        action,
        isTenantAdmin: false,
        pluginActionKey: action,
        verifiedWorkspaceRole: workspaceRole,
      };
      const decision = await evaluate(abacContext, db, redis);
      if (!decision.allowed) throw new ForbiddenError(`Access denied: ${decision.reason}`);
    }

    return {
      hostingType: installation.hostingType,
      pluginSlug: plugin.slug,
      workspaceId: input.workspaceId,
      workspaceRole,
    };
  }, input.tenantContext);
}
