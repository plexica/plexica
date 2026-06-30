// routes/lifecycle/uninstall.routes.ts
// Plugin uninstall route.

import { z } from 'zod';
import { withCoreDb, withTenantDb } from '../../../../lib/tenant-database.js';
import { requireAbac } from '../../../../middleware/abac.js';
import { logger } from '../../../../lib/logger.js';
import { PluginNotFoundError, PluginValidationError } from '../../errors.js';
import { createContainerManager } from '../../services/container-manager.service.js';
import { deleteConsumerGroup } from '../../events/consumer-manager.service.js';
import { resetBreaker } from '../../services/health-check.service.js';

import type { FastifyInstance } from 'fastify';

const uuidSchema = z.string().uuid();
const SAFE_TABLE_REGEX = /^[a-z][a-z0-9_]{1,63}$/;

export async function uninstallRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/v1/plugins/:installId/uninstall', { preHandler: [requireAbac('plugin:manage')] }, async (request) => {
    const { installId } = z.object({ installId: uuidSchema }).parse(request.params);
    const ctx = request.tenantContext;

    return withTenantDb(async (tx: any) => {
      const inst = await tx.pluginInstallation.findUnique({ where: { id: installId }, include: { migrationLogs: true } });
      if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
      if (inst.tenantSlug !== ctx.slug) throw new PluginNotFoundError(`Installation ${installId}`);
      if (inst.status === 'uninstalled') throw new PluginValidationError('Already uninstalled');

      const pluginId = inst.pluginId;
      const pluginRecord = await withCoreDb(async (prisma: any) =>
        prisma.plugin.findUnique({ where: { id: pluginId }, select: { slug: true } })
      ) as { slug: string } | null;
      const expectedPrefix = pluginRecord ? `${pluginRecord.slug}_` : '';

      for (const log of inst.migrationLogs ?? []) {
        if (log.status === 'applied') {
          const tableName = log.migrationName;

          if (!SAFE_TABLE_REGEX.test(tableName)) {
            logger.warn({ tableName, expectedPrefix }, 'Skipping DROP — invalid table name format (possible injection)');
            continue;
          }

          if (!tableName.startsWith(expectedPrefix)) {
            logger.warn({ tableName, expectedPrefix }, 'Skipping DROP — table name does not match plugin prefix');
            continue;
          }
          try {
            await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}"`);
            logger.info({ tableName, installId }, 'Plugin table dropped');
          } catch (err: any) {
            logger.warn({ err: err.message, tableName, installId }, 'Failed to drop plugin table');
          }
        }
      }

      await tx.pluginWorkspaceVisibility.deleteMany({ where: { installId } });
      await tx.pluginInstallation.update({ where: { id: installId }, data: { status: 'uninstalled' } });

      try {
        const mgr = createContainerManager(inst.hostingType);
        await mgr.stopContainer(installId);
      } catch (err: unknown) {
        logger.warn({ err: (err as Error).message, installId }, 'Container stop failed during uninstall (best-effort)');
      }
      try {
        await deleteConsumerGroup(installId, inst.tenantSlug);
      } catch (err: unknown) {
        logger.warn({ err: (err as Error).message, installId }, 'Consumer group deletion failed during uninstall (best-effort)');
      }
      try {
        await resetBreaker(installId);
      } catch (err: unknown) {
        logger.warn({ err: (err as Error).message, installId }, 'Circuit breaker reset failed during uninstall (best-effort)');
      }

      return { status: 'uninstalled', installId };
    }, ctx);
  });
}
