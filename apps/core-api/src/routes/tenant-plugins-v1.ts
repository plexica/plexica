/**
 * Tenant Plugin V1 Routes — Tenant-admin plugin management
 *
 * Spec 004, Task T004-10.
 *
 * These routes allow tenant administrators to:
 *   - List plugins enabled for their tenant
 *   - Enable/disable a globally-active plugin at tenant level
 *   - Update per-tenant plugin configuration
 *
 * Tenant identity is resolved from the JWT (`request.user.tenantSlug`) because
 * the path `/api/v1/tenant/plugins` contains no `:id` URL segment for the tenant.
 * `requireTenantAccess` (which reads `request.params.id`) is therefore NOT used here;
 * instead each handler resolves the tenantId itself via `tenantService.getTenantBySlug()`.
 *
 * Registered in apps/core-api/src/index.ts under `app.register(tenantPluginsV1Routes, { prefix: '/api/v1' })`.
 *
 * Constitution Compliance:
 *   - Article 1.2 §2 (Multi-Tenancy Isolation): tenantId always resolved from authenticated JWT
 *   - Article 3.4 (API Standards): versioned endpoints, standard error format
 *   - Article 5.1 (Auth): all routes require authMiddleware; mutation routes additionally
 *     require tenant_admin / tenant_owner / admin role (requireRole guard)
 *   - Article 6.2 (Error Response Format): { error: { code, message } }
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pluginLifecycleService } from '../services/plugin.service.js';
import { tenantService } from '../services/tenant.service.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

// Roles that are allowed to manage plugins for a tenant (enable/disable/configure).
// Constitution Art. 5.1: RBAC on all protected mutation endpoints.
const requireTenantPluginAdmin = requireRole('tenant_admin', 'tenant_owner', 'admin');

// ---------------------------------------------------------------------------
// Helper: resolve tenantId from JWT
// ---------------------------------------------------------------------------

/**
 * Resolves the UUID of the tenant that the authenticated user belongs to.
 * Throws a structured error reply if the user is not authenticated or the
 * tenant cannot be found.
 */
async function resolveTenantId(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<string | null> {
  if (!request.user) {
    reply.code(401).send({
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
    });
    return null;
  }

  const { tenantSlug } = request.user;
  if (!tenantSlug) {
    reply.code(401).send({
      error: { code: 'AUTH_NO_TENANT', message: 'No tenant context in token' },
    });
    return null;
  }

  let tenant;
  try {
    tenant = await tenantService.getTenantBySlug(tenantSlug);
  } catch (error: unknown) {
    request.log.error({ tenantSlug, error }, 'Failed to resolve tenant from JWT');
    reply.code(500).send({
      error: { code: 'TENANT_FETCH_FAILED', message: 'Failed to resolve tenant context' },
    });
    return null;
  }

  if (!tenant) {
    reply.code(403).send({
      error: { code: 'AUTH_TENANT_NOT_FOUND', message: 'Tenant not found for authenticated user' },
    });
    return null;
  }

  return tenant.id;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function tenantPluginsV1Routes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/tenant/plugins
   * List all plugins installed/enabled for the authenticated user's tenant.
   */
  fastify.get(
    '/tenant/plugins',
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = await resolveTenantId(request, reply);
      if (!tenantId) return;

      try {
        const plugins = await pluginLifecycleService.getInstalledPlugins(tenantId);
        return reply.code(200).send(plugins);
      } catch (error: unknown) {
        request.log.error({ tenantId, error }, 'getInstalledPlugins failed');
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Unexpected error',
          },
        });
      }
    }
  );

  /**
   * POST /api/v1/tenant/plugins/:id/enable
   * Enable a globally-active plugin for this tenant.
   * Returns 409 if the plugin is not globally ACTIVE.
   */
  fastify.post<{ Params: { id: string } }>(
    '/tenant/plugins/:id/enable',
    { preHandler: [authMiddleware, requireTenantPluginAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = await resolveTenantId(request, reply);
      if (!tenantId) return;

      const { id } = request.params;
      try {
        const result = await pluginLifecycleService.enableForTenant(tenantId, id);
        return reply.code(200).send(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Enable failed';
        const code = (error as any)?.code;

        if (code === 'PLUGIN_NOT_GLOBALLY_ACTIVE') {
          return reply.code(409).send({
            error: {
              code: 'PLUGIN_NOT_GLOBALLY_ACTIVE',
              message: 'Plugin must be globally enabled first',
            },
          });
        }

        request.log.error({ tenantId, pluginId: id, error }, 'enableForTenant failed');
        const status = message.includes('not found') ? 404 : 400;
        return reply.code(status).send({
          error: { code: 'ENABLE_FAILED', message },
        });
      }
    }
  );

  /**
   * POST /api/v1/tenant/plugins/:id/disable
   * Disable a plugin for this tenant (preserves configuration).
   */
  fastify.post<{ Params: { id: string } }>(
    '/tenant/plugins/:id/disable',
    { preHandler: [authMiddleware, requireTenantPluginAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = await resolveTenantId(request, reply);
      if (!tenantId) return;

      const { id } = request.params;
      try {
        const result = await pluginLifecycleService.disableForTenant(tenantId, id);
        return reply.code(200).send(result);
      } catch (error: unknown) {
        request.log.error({ tenantId, pluginId: id, error }, 'disableForTenant failed');
        const message = error instanceof Error ? error.message : 'Disable failed';
        const status = message.includes('not found') ? 404 : 400;
        return reply.code(status).send({
          error: { code: 'DISABLE_FAILED', message },
        });
      }
    }
  );

  /**
   * PUT /api/v1/tenant/plugins/:id/config
   * Update per-tenant plugin configuration (validated against manifest schema).
   */
  fastify.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/tenant/plugins/:id/config',
    { preHandler: [authMiddleware, requireTenantPluginAdmin] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
      reply: FastifyReply
    ) => {
      const tenantId = await resolveTenantId(request, reply);
      if (!tenantId) return;

      const { id } = request.params;
      try {
        const result = await pluginLifecycleService.updateConfiguration(
          tenantId,
          id,
          request.body ?? {}
        );
        return reply.code(200).send(result);
      } catch (error: unknown) {
        request.log.error({ tenantId, pluginId: id, error }, 'updateConfiguration failed');
        const message = error instanceof Error ? error.message : 'Config update failed';
        const isValidation =
          message.toLowerCase().includes('validation') ||
          message.toLowerCase().includes('schema') ||
          message.toLowerCase().includes('invalid');
        const status = isValidation ? 400 : message.includes('not found') ? 404 : 500;
        return reply.code(status).send({
          error: { code: isValidation ? 'INVALID_CONFIGURATION' : 'CONFIG_UPDATE_FAILED', message },
        });
      }
    }
  );
}
