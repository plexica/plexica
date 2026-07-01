// routes/lifecycle/deactivate.routes.ts
// Plugin deactivate route.

import { z } from 'zod';

import { withTenantDb } from '../../../../lib/tenant-database.js';
import { requireAbac } from '../../../../middleware/abac.js';
import { PluginNotFoundError, PluginValidationError } from '../../errors.js';
import { pauseConsumerGroup } from '../../events/consumer-manager.service.js';
import { clearVisibilityCache } from '../../services/visibility.service.js';

import type { FastifyInstance } from 'fastify';

const uuidSchema = z.string().uuid();

export async function deactivateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/v1/plugins/:installId/deactivate', { preHandler: [requireAbac('plugin:manage')] }, async (request) => {
    const { installId } = z.object({ installId: uuidSchema }).parse(request.params);
    const ctx = request.tenantContext;

    return withTenantDb(async (tx: any) => {
      const inst = await tx.pluginInstallation.findUnique({ where: { id: installId } });
      if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
      if (inst.tenantSlug !== ctx.slug) throw new PluginNotFoundError(`Installation ${installId}`);
      if (inst.status !== 'active' && inst.status !== 'degraded') {
        throw new PluginValidationError(`Status: ${inst.status}`);
      }

      await pauseConsumerGroup(installId, inst.tenantSlug);
      await tx.pluginInstallation.update({ where: { id: installId }, data: { status: 'deactivated' } });

      // AC-03: per-workspace overrides are PRESERVED across deactivate/reactivate.
      // We do NOT mutate pluginWorkspaceVisibility.isEnabled here — the visibility
      // resolver (visibility.service.ts) returns false while status === 'deactivated',
      // and original override values remain intact for restoration on reactivation.
      await clearVisibilityCache(installId);
      return { status: 'deactivated', installId };
    }, ctx);
  });
}
