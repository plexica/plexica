// routes/lifecycle/deactivate.routes.ts
// Plugin deactivate route.

import { z } from 'zod';

import { withTenantDb, type TenantPrismaClient } from '../../../../lib/tenant-database.js';
import { requireAbac } from '../../../../middleware/abac.js';
import { PluginNotFoundError, PluginValidationError } from '../../errors.js';
import { pauseConsumerGroup } from '../../events/consumer-manager.service.js';
import { createContainerManager } from '../../services/container-manager.service.js';
import { disableDevBackend } from '../../services/dev-backends.js';
import { clearVisibilityCache } from '../../services/visibility.service.js';
import { revokeInstallationCredentials } from '../../services/service-credential.service.js';

import type { FastifyInstance } from 'fastify';

const uuidSchema = z.string().uuid();

export async function deactivateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/plugins/:installId/deactivate',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = z.object({ installId: uuidSchema }).parse(request.params);
      const ctx = request.tenantContext;

      return withTenantDb(async (tx: TenantPrismaClient) => {
        const inst = await tx.pluginInstallation.findUnique({ where: { id: installId } });
        if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
        if (inst.tenantSlug !== ctx.slug)
          throw new PluginNotFoundError(`Installation ${installId}`);
        if (!['active', 'degraded', 'deactivated'].includes(inst.status)) {
          throw new PluginValidationError(`Status: ${inst.status}`);
        }

        if (inst.status !== 'deactivated') {
          await tx.pluginInstallation.update({
            where: { id: installId },
            data: { status: 'deactivated' },
          });
        }
        await clearVisibilityCache(installId);
        disableDevBackend(installId);
        const shutdown = await Promise.allSettled([
          pauseConsumerGroup(installId, inst.tenantSlug),
          revokeInstallationCredentials(installId),
          createContainerManager(inst.hostingType).stopContainer(installId),
        ]);
        const failure = shutdown.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        return { status: 'deactivated', installId };
      }, ctx);
    }
  );
}
