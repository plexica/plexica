import { withTenantDb } from '../../../lib/tenant-database.js';
import { PluginConflictError } from '../errors.js';

import { createContainerManager } from './container-manager.service.js';
import { dropPluginRole } from './db-role.service.js';

import type { TenantContext } from '../../../lib/tenant-context-store.js';

const REINSTALLABLE_STATUSES = new Set(['failed', 'uninstalled']);

export function blocksReInstall(status: string): boolean {
  return !REINSTALLABLE_STATUSES.has(status);
}

interface InstallationRecordInput {
  context: TenantContext;
  pluginId: string;
  pluginSlug: string;
  pluginVersion: string;
  hostingType: string;
  userId: string;
}

export async function createInstallationRecord(input: InstallationRecordInput) {
  const { context, pluginId, pluginSlug, pluginVersion, hostingType, userId } = input;
  return withTenantDb(async (db) => {
    const existing = await db.pluginInstallation.findUnique({
      where: { pluginId_tenantSlug: { pluginId, tenantSlug: context.slug } },
    });
    if (existing && blocksReInstall(existing.status)) {
      throw new PluginConflictError(`Plugin "${pluginSlug}" is already installed`);
    }
    if (existing) {
      await dropPluginRole(existing.id, context.slug).catch(() => undefined);
      await createContainerManager(existing.hostingType)
        .removeContainer(existing.id)
        .catch(() => undefined);
      return db.pluginInstallation.update({
        where: { id: existing.id },
        data: {
          status: 'installing',
          version: pluginVersion,
          hostingType,
          installedBy: userId,
          installedAt: new Date(),
        },
      });
    }
    return db.pluginInstallation.create({
      data: {
        pluginId,
        tenantSlug: context.slug,
        version: pluginVersion,
        status: 'installing',
        hostingType,
        installedBy: userId,
      },
    });
  }, context);
}
