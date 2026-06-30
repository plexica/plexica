// routes/proxy.routes.ts
// Plugin proxy with auth enforcement. Forwards requests to plugin backend.

import { getDevBackend, proxyRequest } from '../services/proxy.service.js';
import { createContainerManager } from '../services/container-manager.service.js';
import { PluginNotFoundError } from '../errors.js';
import { requireAbac } from '../../../middleware/abac.js';
import { withTenantDb } from '../../../lib/tenant-database.js';

import type { FastifyInstance } from 'fastify';

export async function proxyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.all(
    '/api/v1/plugins/:installId/proxy/*',
    { preHandler: [requireAbac('plugin:access')] },
    async (request, reply) => {
      const { installId } = request.params as { installId: string };
      const ctx = request.tenantContext;

      // Check dev mode first
      const devBackend = getDevBackend(installId);
      if (devBackend) {
        return proxyRequest(request, reply, devBackend);
      }

      // Look up installation hosting type
      const installation = await withTenantDb(async (tx: any) => {
        return tx.pluginInstallation.findUnique({ where: { id: installId }, select: { hostingType: true } });
      }, ctx);

      if (!installation) {
        throw new PluginNotFoundError(`Installation ${installId}`);
      }

      const containerManager = createContainerManager(installation.hostingType);
      return proxyRequest(request, reply, { baseUrl: await containerManager.getContainerUrl(installId), installId });
    }
  );
}
