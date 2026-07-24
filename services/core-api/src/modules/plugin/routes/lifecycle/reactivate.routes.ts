// routes/lifecycle/reactivate.routes.ts
// Plugin reactivate route — supports reactivation from 'deactivated' and 'degraded'.

import { z } from 'zod';

import {
  withCoreDb,
  withTenantDb,
  type TenantPrismaClient,
} from '../../../../lib/tenant-database.js';
import { requireAbac } from '../../../../middleware/abac.js';
import { PluginNotFoundError, PluginValidationError } from '../../errors.js';
import { createContainerManager } from '../../services/container-manager.service.js';
import { enableDevBackend } from '../../services/dev-backends.js';
import { resumeConsumerGroup } from '../../events/consumer-manager.service.js';
import { clearVisibilityCache } from '../../services/visibility.service.js';
import { recoverInstallationConsumer } from '../../services/runtime-recovery.service.js';
import { resetBreaker } from '../../services/health-check.service.js';
import {
  completeCredentialRotation,
  issueServiceCredential,
} from '../../services/service-credential.service.js';

import type { FastifyInstance } from 'fastify';

const uuidSchema = z.string().uuid();

export async function reactivateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/plugins/:installId/reactivate',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = z.object({ installId: uuidSchema }).parse(request.params);
      const ctx = request.tenantContext;

      const inst = await withTenantDb(async (tx: TenantPrismaClient) => {
        const inst = await tx.pluginInstallation.findUnique({ where: { id: installId } });
        if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
        if (inst.tenantSlug !== ctx.slug)
          throw new PluginNotFoundError(`Installation ${installId}`);
        if (inst.status !== 'deactivated' && inst.status !== 'degraded') {
          throw new PluginValidationError(`Status: ${inst.status}`);
        }

        const plugin = await withCoreDb((db) =>
          db.plugin.findUnique({ where: { id: inst.pluginId }, select: { slug: true } })
        );
        if (!plugin) throw new PluginNotFoundError(`Plugin ${inst.pluginId}`);
        return { ...inst, pluginSlug: plugin.slug };
      }, ctx);

      const credential = await issueServiceCredential({
        tenantId: ctx.tenantId,
        tenantSlug: ctx.slug,
        installId,
        pluginId: inst.pluginId,
        pluginSlug: inst.pluginSlug,
      });
      const mgr = createContainerManager(inst.hostingType);
      try {
        await mgr.restartContainer(installId, { PLEXICA_SERVICE_TOKEN: credential.token });
        await completeCredentialRotation(installId, credential.credentialId, true);
      } catch (error) {
        await completeCredentialRotation(installId, credential.credentialId, false);
        throw error;
      }
      await resetBreaker(installId);
      await recoverInstallationConsumer(inst);
      await resumeConsumerGroup(installId, inst.tenantSlug);
      await withTenantDb(
        (tx: TenantPrismaClient) =>
          tx.pluginInstallation.update({
            where: { id: installId },
            data: { status: 'active' },
          }),
        ctx
      );

      // AC-03: visibility overrides are preserved while deactivated.
      await clearVisibilityCache(installId);
      enableDevBackend(installId);
      return { status: 'active', installId };
    }
  );
}
