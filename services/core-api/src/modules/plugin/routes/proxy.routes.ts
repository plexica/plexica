// routes/proxy.routes.ts
// Plugin proxy with auth enforcement. Forwards requests to plugin backend.

import { getDevBackend, proxyRequest } from '../services/proxy.service.js';
import { createContainerManager } from '../services/container-manager.service.js';
import { PluginNotFoundError } from '../errors.js';
import { ForbiddenError } from '../../../lib/app-error.js';
import { withTenantDb, withCoreDb } from '../../../lib/tenant-database.js';
import { evaluate } from '../../../modules/abac/engine.js';
import { redis } from '../../../lib/redis.js';

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AbacContext } from '../../../modules/abac/types.js';

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
 * CRITICAL #12 / A2 — ABAC preHandler that enforces the plugin's action key.
 *
 * The previous implementation delegated to requireAbac(`${slug}:access`), but
 * requireAbac extracts workspaceId from route params (`:workspaceId`/`:id`).
 * The proxy route param is `:installId`, so workspaceId was always empty →
 * the middleware fell through to "allow any authenticated user" for non-admins.
 * AC-02 (per-workspace authorization) was never enforced.
 *
 * We now resolve workspaceId from the X-Plexica-Workspace-Id header (the same
 * header the proxy forwards to the backend) and call evaluate() directly with
 * the correct workspace context. Fail-closed: tenant admin bypasses workspace
 * checks; everyone else is evaluated against the plugin's ABAC action.
 */
async function pluginProxyAbac(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const { installId } = request.params as { installId: string };

  // Dev mode: dev plugins are registered by slug (no real installId).
  // Skip DB-based ABAC resolution — dev mode is localhost-only (gated in dev.routes.ts).
  if (getDevBackend(installId)) return;

  const tenantCtx = request.tenantContext;
  const isTenantAdmin = request.user?.roles.includes('tenant_admin') ?? false;

  const slug = await resolvePluginSlug(installId, tenantCtx);
  const action = `${slug}:access`;

  // Resolve workspaceId from the header (NOT route params — proxy uses :installId).
  const wsHeader = request.headers['x-plexica-workspace-id'];
  const workspaceId = (typeof wsHeader === 'string' ? wsHeader : '') ?? '';

  // No workspace context → tenant-level. Tenant admin allowed; everyone else denied.
  if (workspaceId === '') {
    if (isTenantAdmin) return;
    throw new ForbiddenError(`Tenant admin role required for plugin action "${action}"`);
  }

  // Workspace-scoped → evaluate ABAC with the real workspaceId.
  // pluginActionKey is set so the engine looks up the action_registry
  // defaultRole (or falls back to `viewer`) instead of denying the unknown
  // 2-part action. Per-action enforcement via 3-part actions is a future
  // enhancement (apiMappings); baseline access is workspace-member-scoped.
  // Tenant admins bypass workspace membership checks (they have access to all
  // workspaces in their tenant — same as the workspace:read list endpoint).
  if (isTenantAdmin) return;

  const ctx: AbacContext = {
    userId: request.user.id,
    workspaceId,
    tenantSlug: tenantCtx.slug,
    action,
    isTenantAdmin,
    pluginActionKey: action,
  };
  const decision = await withTenantDb((tx) => evaluate(ctx, tx, redis), tenantCtx);
  if (!decision.allowed) {
    throw new ForbiddenError(`Access denied: ${decision.reason}`);
  }
}

export async function proxyRoutes(fastify: FastifyInstance): Promise<void> {
  // CRITICAL: Register a passthrough content-type parser so non-JSON bodies
  // (multipart, binary, form-data) are NOT rejected with 415 and the raw
  // request stream is preserved for forwarding to the plugin backend.
  // This parser is scoped to the proxy route group only (Fastify encapsulation).
  fastify.addContentTypeParser(
    '*',
    { parseAs: 'buffer' },
    (_req: unknown, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
      done(null, body);
    },
  );

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

      // Dev mode fallback: check by slug (dev backends are registered by slug,
      // but the proxy URL uses installId). Resolve the slug and check dev registry.
      const slug = await resolvePluginSlug(installId, ctx);
      const devBackendBySlug = getDevBackend(slug);
      if (devBackendBySlug) {
        return proxyRequest(request, reply, devBackendBySlug);
      }

      const containerManager = createContainerManager(installation.hostingType);
      return proxyRequest(request, reply, { baseUrl: await containerManager.getContainerUrl(installId), installId });
    },
  );
}
