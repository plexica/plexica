// routes/proxy.routes.ts
// Plugin proxy route — forwards ALL requests to plugin backend.

import { getDevBackend, proxyRequest } from '../services/proxy.service.js';
import { createContainerManager } from '../services/container-manager.service.js';
import { PluginNotFoundError } from '../errors.js';

import type { FastifyInstance } from 'fastify';

export async function proxyRoutes(fastify: FastifyInstance): Promise<void> {
  // ALL /api/v1/plugins/:installId/proxy/*
  // Matches any HTTP method and any sub-path
  fastify.all('/api/v1/plugins/:installId/proxy/*', async (request, reply) => {
    const { installId } = request.params as { installId: string };

    // Check dev mode first
    const devBackend = getDevBackend(installId);
    if (devBackend) {
      return proxyRequest(request, reply, devBackend);
    }

    // Check production container
    const containerManager = createContainerManager('sidecar');
    const status = await containerManager.getContainerStatus(installId);

    if (status.state === 'not_found') {
      throw new PluginNotFoundError(`Installation ${installId}`);
    }

    if (status.port === undefined) {
      throw new PluginNotFoundError(`Installation ${installId} has no port mapping`);
    }

    return proxyRequest(request, reply, {
      baseUrl: `http://localhost:${status.port}`,
      installId,
    });
  });
}
