// routes/proxy.routes.ts
// Plugin proxy with lifecycle, visibility, membership, and ABAC enforcement.

import { z } from 'zod';

import { ValidationError } from '../../../lib/app-error.js';
import { createContainerManager } from '../services/container-manager.service.js';
import { getDevBackendForInstallation } from '../services/dev-backends.js';
import { authorizePluginProxy } from '../services/proxy-authorization.service.js';
import { proxyRequest } from '../services/proxy.service.js';

import type { FastifyInstance } from 'fastify';

const proxyParamsSchema = z.object({ installId: z.string().uuid() });
const workspaceHeaderSchema = z.string().uuid();

export async function proxyRoutes(fastify: FastifyInstance): Promise<void> {
  // CRITICAL: Register a passthrough content-type parser so non-JSON bodies
  // (multipart, binary, form-data) are NOT rejected with 415 and the raw
  // request stream is preserved for forwarding to the plugin backend.
  // This parser is scoped to the proxy route group only (Fastify encapsulation).
  // Global @fastify/rate-limit (global: true) also covers this route.
  // codeql[js/missing-rate-limiting]
  fastify.addContentTypeParser(
    '*',
    { parseAs: 'buffer' },
    (_req: unknown, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
      done(null, body);
    },
  );

  fastify.all(
    '/api/v1/plugins/:installId/proxy/*',
    {
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsedParams = proxyParamsSchema.safeParse(request.params);
      const parsedWorkspace = workspaceHeaderSchema.safeParse(
        request.headers['x-plexica-workspace-id']
      );
      if (!parsedParams.success || !parsedWorkspace.success) {
        throw new ValidationError('A valid installation and workspace ID are required');
      }
      const { installId } = parsedParams.data;
      const access = await authorizePluginProxy({
        installId,
        workspaceId: parsedWorkspace.data,
        userId: request.user.id,
        isTenantAdmin: request.user.roles.includes('tenant_admin'),
        tenantContext: request.tenantContext,
      });
      const devBackend = getDevBackendForInstallation(access.pluginSlug, installId);
      const target = devBackend ?? {
        baseUrl: await createContainerManager(access.hostingType).getContainerUrl(installId),
        installId,
      };
      return proxyRequest(request, reply, target, access);
    },
  );
}
