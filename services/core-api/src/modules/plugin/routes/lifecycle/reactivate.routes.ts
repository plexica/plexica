// routes/lifecycle/reactivate.routes.ts
// Plugin reactivate route — supports reactivation from 'deactivated' and 'degraded'.

import { z } from 'zod';
import { withTenantDb } from '../../../../lib/tenant-database.js';
import { requireAbac } from '../../../../middleware/abac.js';
import { PluginNotFoundError, PluginValidationError } from '../../errors.js';
import { createContainerManager } from '../../services/container-manager.service.js';
import { resumeConsumerGroup } from '../../events/consumer-manager.service.js';
import { clearVisibilityCache } from '../../services/visibility.service.js';

import type { FastifyInstance } from 'fastify';

const uuidSchema = z.string().uuid();

export async function reactivateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/v1/plugins/:installId/reactivate', { preHandler: [requireAbac('plugin:manage')] }, async (request) => {
    const { installId } = z.object({ installId: uuidSchema }).parse(request.params);
    const ctx = request.tenantContext;

    return withTenantDb(async (tx: any) => {
      const inst = await tx.pluginInstallation.findUnique({ where: { id: installId } });
      if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
      if (inst.tenantSlug !== ctx.slug) throw new PluginNotFoundError(`Installation ${installId}`);
      if (inst.status !== 'deactivated' && inst.status !== 'degraded') {
        throw new PluginValidationError(`Status: ${inst.status}`);
      }

      const mgr = createContainerManager(inst.hostingType);
      await mgr.restartContainer(installId);
      await resumeConsumerGroup(installId, inst.tenantSlug);
      await tx.pluginInstallation.update({ where: { id: installId }, data: { status: 'active' } });

      // Restore workspace visibility for entries that had overrides (re-enable
      // previously overridden workspaces; non-overridden fall back to tenant default).
      await tx.pluginWorkspaceVisibility.updateMany({
        where: { installId, isOverride: true },
        data: { isEnabled: true },
      });

      clearVisibilityCache(installId);
      return { status: 'active', installId };
    }, ctx);
  });
}
