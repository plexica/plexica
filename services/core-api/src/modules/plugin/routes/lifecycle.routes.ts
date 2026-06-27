// routes/lifecycle.routes.ts
// Plugin lifecycle: deactivate, reactivate, uninstall.

import { withTenantDb } from '../../../lib/tenant-database.js';
import { requireAbac } from '../../../middleware/abac.js';
import { PluginNotFoundError, PluginValidationError } from '../errors.js';
import { createContainerManager } from '../services/container-manager.service.js';
import { resumeConsumerGroup, pauseConsumerGroup, deleteConsumerGroup } from '../events/consumer-manager.service.js';
import { resetBreaker } from '../services/health-check.service.js';

import type { FastifyInstance } from 'fastify';

export async function lifecycleRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/plugins/:installId/deactivate',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = request.params as { installId: string };
      const ctx = request.tenantContext;

      return withTenantDb(async (tx: any) => {
        const installation = await tx.pluginInstallation.findUnique({ where: { id: installId } });
        if (!installation) throw new PluginNotFoundError(`Installation ${installId}`);
        if (installation.status !== 'active') {
          throw new PluginValidationError(`Plugin is not active (status: ${installation.status})`);
        }

        const mgr = createContainerManager(installation.hostingType);
        await mgr.stopContainer(installId);
        await pauseConsumerGroup(installId, installation.tenantSlug);

        await tx.pluginInstallation.update({
          where: { id: installId },
          data: { status: 'deactivated' },
        });

        return { status: 'deactivated', installId };
      }, ctx);
    }
  );

  fastify.post(
    '/api/v1/plugins/:installId/reactivate',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = request.params as { installId: string };
      const ctx = request.tenantContext;

      return withTenantDb(async (tx: any) => {
        const installation = await tx.pluginInstallation.findUnique({ where: { id: installId } });
        if (!installation) throw new PluginNotFoundError(`Installation ${installId}`);
        if (installation.status !== 'deactivated') {
          throw new PluginValidationError(`Plugin is not deactivated (status: ${installation.status})`);
        }

        const mgr = createContainerManager(installation.hostingType);
        await mgr.restartContainer(installId);
        await resumeConsumerGroup(installId, installation.tenantSlug);

        await tx.pluginInstallation.update({
          where: { id: installId },
          data: { status: 'active' },
        });

        return { status: 'active', installId };
      }, ctx);
    }
  );

  fastify.post(
    '/api/v1/plugins/:installId/uninstall',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = request.params as { installId: string };
      const ctx = request.tenantContext;

      return withTenantDb(async (tx: any) => {
        const installation = await tx.pluginInstallation.findUnique({
          where: { id: installId },
          include: { migrationLogs: true },
        });
        if (!installation) throw new PluginNotFoundError(`Installation ${installId}`);
        if (installation.status === 'uninstalled') {
          throw new PluginValidationError('Plugin is already uninstalled');
        }

        const mgr = createContainerManager(installation.hostingType);
        await mgr.stopContainer(installId);
        await deleteConsumerGroup(installId, installation.tenantSlug);
        await resetBreaker(installId);

        // Drop plugin migration tables
        for (const log of installation.migrationLogs ?? []) {
          if (log.status === 'applied') {
            try {
              await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "${log.migrationName}" CASCADE`);
            } catch { /* table may not exist */ }
          }
        }

        await tx.pluginWorkspaceVisibility.deleteMany({ where: { installId } });
        await tx.pluginInstallation.update({
          where: { id: installId },
          data: { status: 'uninstalled' },
        });

        return { status: 'uninstalled', installId };
      }, ctx);
    }
  );
}
