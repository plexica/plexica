// routes/lifecycle/uninstall.routes.ts
// Plugin uninstall route.

import { z } from 'zod';

import { withCoreDb, withTenantDb } from '../../../../lib/tenant-database.js';
import { requireAbac } from '../../../../middleware/abac.js';
import { logger } from '../../../../lib/logger.js';
import { PluginNotFoundError, PluginValidationError } from '../../errors.js';
import { createContainerManager } from '../../services/container-manager.service.js';
import { disableDevBackend, unregisterDevBackend } from '../../services/dev-backends.js';
import { deleteConsumerGroup, pauseConsumerGroup } from '../../events/consumer-manager.service.js';
import { resetBreaker } from '../../services/health-check.service.js';
import { dropPluginRole } from '../../services/db-role.service.js';
import { revokeInstallationCredentials } from '../../services/service-credential.service.js';
import { clearVisibilityCache } from '../../services/visibility.service.js';

import type { FastifyInstance } from 'fastify';

const uuidSchema = z.string().uuid();
const SAFE_TABLE_REGEX = /^[a-z][a-z0-9_]{1,63}$/;

export async function uninstallRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/plugins/:installId/uninstall',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = z.object({ installId: uuidSchema }).parse(request.params);
      const ctx = request.tenantContext;

      return withTenantDb(async (tx) => {
        const inst = await tx.pluginInstallation.findUnique({
          where: { id: installId },
          include: { migrationLogs: true },
        });
        if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
        if (inst.tenantSlug !== ctx.slug)
          throw new PluginNotFoundError(`Installation ${installId}`);
        if (inst.status === 'uninstalled') throw new PluginValidationError('Already uninstalled');

        const pluginId = inst.pluginId;
        await tx.pluginInstallation.update({
          where: { id: installId },
          data: { status: 'deactivated' },
        });
        await clearVisibilityCache(installId);
        disableDevBackend(installId);
        await pauseConsumerGroup(installId, inst.tenantSlug);
        await revokeInstallationCredentials(installId);
        const pluginRecord = (await withCoreDb((prisma) =>
          prisma.plugin.findUnique({ where: { id: pluginId }, select: { slug: true } })
        )) as { slug: string } | null;
        const expectedPrefix = pluginRecord ? `${pluginRecord.slug}_` : '';
        if (pluginRecord) unregisterDevBackend(pluginRecord.slug, installId);

        for (const log of inst.migrationLogs ?? []) {
          if (log.status === 'applied') {
            const tableName = log.migrationName;

            if (!SAFE_TABLE_REGEX.test(tableName)) {
              logger.warn(
                { tableName, expectedPrefix },
                'Skipping DROP — invalid table name format (possible injection)'
              );
              continue;
            }

            if (!tableName.startsWith(expectedPrefix)) {
              logger.warn(
                { tableName, expectedPrefix },
                'Skipping DROP — table name does not match plugin prefix'
              );
              continue;
            }
            try {
              await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}"`);
              logger.info({ tableName, installId }, 'Plugin table dropped');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.warn({ err: msg, tableName, installId }, 'Failed to drop plugin table');
            }
          }
        }

        await tx.pluginWorkspaceVisibility.deleteMany({ where: { installId } });

        // AC-02: all action_registry and workspace_role_action entries for this
        // plugin must be gone after uninstall. Both tenant tables carry plugin_id.
        await tx.actionRegistry.deleteMany({ where: { pluginId } }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(
            { err: msg, installId, pluginId },
            'Failed to delete plugin action_registry entries during uninstall'
          );
        });
        await tx.workspaceRoleAction.deleteMany({ where: { pluginId } }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(
            { err: msg, installId, pluginId },
            'Failed to delete plugin workspace_role_action overrides during uninstall'
          );
        });

        await tx.pluginInstallation.update({
          where: { id: installId },
          data: { status: 'uninstalled' },
        });

        // DR-18 / plan §10.3: drop the restricted PostgreSQL role and its grants.
        // Best-effort — table drops above may have already removed owned objects,
        // but the role itself and schema USAGE must be revoked explicitly.
        try {
          await dropPluginRole(installId, inst.tenantSlug);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(
            { err: msg, installId },
            'Plugin DB role drop failed during uninstall (best-effort)'
          );
        }

        try {
          const mgr = createContainerManager(inst.hostingType);
          // removeContainer stops + removes the container so its name is freed
          // for re-install (startContainer would 409 on a leftover stopped container).
          await mgr.removeContainer(installId);
        } catch (err: unknown) {
          logger.warn(
            { err: (err as Error).message, installId },
            'Container removal failed during uninstall (best-effort)'
          );
        }
        try {
          await deleteConsumerGroup(installId, inst.tenantSlug);
        } catch (err: unknown) {
          logger.warn(
            { err: (err as Error).message, installId },
            'Consumer group deletion failed during uninstall (best-effort)'
          );
        }
        try {
          await resetBreaker(installId);
        } catch (err: unknown) {
          logger.warn(
            { err: (err as Error).message, installId },
            'Circuit breaker reset failed during uninstall (best-effort)'
          );
        }

        return { status: 'uninstalled', installId };
      }, ctx);
    }
  );
}
