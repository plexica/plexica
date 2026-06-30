// routes/proxy.routes.ts
// Plugin proxy with auth enforcement. Forwards requests to plugin backend.

import { getDevBackend, proxyRequest } from '../services/proxy.service.js';
import { createContainerManager } from '../services/container-manager.service.js';
import { PluginNotFoundError } from '../errors.js';
import { requireAbac } from '../../../middleware/abac.js';
import { withTenantDb, withCoreDb } from '../../../lib/tenant-database.js';

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// CRITICAL #12 — in-memory cache of installId → plugin slug. The slug never
// changes for an installation, so a process-local cache is safe and avoids a
// DB round-trip on every proxied request. Re-resolved on cache miss.
const slugByInstallId = new Map<string, string>();

async function resolvePluginSlug(installId: string, tenantCtx: unknown): Promise<string> {
  const cached = slugByInstallId.get(installId);
  if (cached) return cached;

  const installation = await withTenantDb(async (tx: any) => {
    return tx.pluginInstallation.findUnique({ where: { id: installId }, select: { pluginId: true } });
  }, tenantCtx as any);

  if (!installation) throw new PluginNotFoundError(`Installation ${installId}`);

  const plugin = await withCoreDb(async (db: any) =>
    db.plugin.findUnique({ where: { id: installation.pluginId }, select: { slug: true } }),
  );
  if (!plugin) throw new PluginNotFoundError(`Installation ${installId}`);

  slugByInstallId.set(installId, plugin.slug as string);
  return plugin.slug as string;
}

/**
 * CRITICAL #12 — ABAC preHandler that enforces the plugin's 3-part action key.
 *
 * The previous implementation used the 2-part core key `plugin:access`, which
 * bypassed the plugin-action ABAC machinery entirely. We now resolve the target
 * plugin slug from the installation and evaluate ABAC against `{slug}:access`.
 *
 * Future enhancement: when manifests declare `apiMappings`, map the request
 * method + path to the precise 3-part action (e.g. `crm:contact:create`) and
 * evaluate that instead. Per-action enforcement is deferred until manifests
 * populate apiMappings; the generic key is documented and safe (fail-closed
 * for unknown actions via the ABAC engine).
 */
async function pluginProxyAbac(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const { installId } = request.params as { installId: string };

  // Dev mode: dev plugins are registered by slug (no real installId).
  // Skip DB-based ABAC resolution — dev mode is localhost-only (gated in dev.routes.ts).
  if (getDevBackend(installId)) return;

  const slug = await resolvePluginSlug(installId, request.tenantContext);
  const handler = requireAbac(`${slug}:access`);
  await handler(request, _reply);
}

export async function proxyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.all(
    '/api/v1/plugins/:installId/proxy/*',
    { preHandler: [pluginProxyAbac] },
    async (request, reply) => {
      const { installId } = request.params as { installId: string };

      // Dev mode: check by slug first (dev plugins have no real installId).
      const devBackend = getDevBackend(installId);
      if (devBackend) {
        return proxyRequest(request, reply, devBackend);
      }

      const ctx = request.tenantContext;
      const installation = await withTenantDb(async (tx: any) => {
        return tx.pluginInstallation.findUnique({ where: { id: installId }, select: { hostingType: true } });
      }, ctx);

      if (!installation) {
        throw new PluginNotFoundError(`Installation ${installId}`);
      }

      const containerManager = createContainerManager(installation.hostingType);
      return proxyRequest(request, reply, { baseUrl: await containerManager.getContainerUrl(installId), installId });
    },
  );
}
