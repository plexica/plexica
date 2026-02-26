/**
 * Plugin V1 Routes — Super-admin lifecycle management & health-check proxy
 *
 * Spec 004, Tasks T004-09 and T004-11.
 *
 * These routes provide the spec-aligned API surface for:
 *   - Super-admin plugin registration, installation, lifecycle transitions (T004-09)
 *   - Health-check proxy endpoints for monitoring plugin containers (T004-11)
 *
 * Existing routes in plugin.ts are NOT modified (Constitution Art. 1.2 §3 —
 * backward compatibility). These v1 routes are registered under /api/v1 prefix
 * in apps/core-api/src/index.ts.
 *
 * Constitution Compliance:
 *   - Article 1.2 §1 (Security First): all routes require super-admin auth
 *   - Article 3.4 (API Standards): versioned endpoints, standard error format
 *   - Article 6.2 (Error Response Format): { error: { code, message } }
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pluginRegistryService, pluginLifecycleService } from '../services/plugin.service.js';
import { moduleFederationRegistryService } from '../services/module-federation-registry.service.js';
import { requireSuperAdmin, authMiddleware } from '../middleware/auth.js';
import { redis } from '../lib/redis.js';
import type { PluginManifest } from '../types/plugin.types.js';
import { PluginLifecycleStatus } from '@plexica/database';

// Global sentinel tenantId used for platform-level (non-tenant-scoped) operations.
const GLOBAL_TENANT_ID = '__global__';

// Health cache TTL in seconds (plan.md §9).
const HEALTH_CACHE_TTL_S = 10;

// Timeout for container proxy requests in milliseconds.
const CONTAINER_PROXY_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the container base URL for a plugin.
 *
 * The URL follows the conventional naming pattern used in plugin.service.ts:
 *   http://plugin-<pluginId>:8080
 *
 * This matches the fallback used when a plugin's manifest does not declare
 * an explicit service baseUrl (plugin.service.ts lines 102, 763).
 */
function resolveContainerBaseUrl(pluginId: string): string {
  return `http://plugin-${pluginId}:8080`;
}

/**
 * Proxy a request to a plugin container with a fixed timeout.
 * Returns the parsed JSON body on success, or throws on network/timeout error.
 */
async function proxyToContainer(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Container responded with HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function pluginV1Routes(fastify: FastifyInstance) {
  // =========================================================================
  // T004-09 — Super-admin plugin lifecycle routes
  // =========================================================================

  /**
   * GET /api/v1/plugins
   * List all registered plugins, optionally filtered by status or lifecycleStatus.
   */
  fastify.get<{
    Querystring: {
      page?: number;
      limit?: number;
      status?: string;
      lifecycleStatus?: PluginLifecycleStatus;
    };
  }>(
    '/plugins',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (
      request: FastifyRequest<{
        Querystring: {
          page?: number;
          limit?: number;
          status?: string;
          lifecycleStatus?: PluginLifecycleStatus;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { plugins, total } = await pluginRegistryService.listPlugins({
          status: request.query.status as any,
          category: undefined,
        });

        // Filter by lifecycleStatus when provided
        const { lifecycleStatus } = request.query;
        const result = lifecycleStatus
          ? plugins.filter((p: any) => p.lifecycleStatus === lifecycleStatus)
          : plugins;

        return reply.code(200).send({ plugins: result, total: result.length });
      } catch (error: unknown) {
        request.log.error(error, 'listPlugins failed');
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
   * POST /api/v1/plugins
   * Register a new plugin in the global registry.
   */
  fastify.post<{ Body: PluginManifest }>(
    '/plugins',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (request: FastifyRequest<{ Body: PluginManifest }>, reply: FastifyReply) => {
      try {
        const plugin = await pluginRegistryService.registerPlugin(request.body);
        return reply.code(200).send(plugin);
      } catch (error: unknown) {
        request.log.error(error, 'registerPlugin failed');
        const message = error instanceof Error ? error.message : 'Registration failed';
        return reply.code(400).send({
          error: { code: 'REGISTRATION_FAILED', message },
        });
      }
    }
  );

  /**
   * POST /api/v1/plugins/:id/install
   * Install a plugin globally (platform-level, no tenant scope).
   */
  fastify.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/plugins/:id/install',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      try {
        const result = await pluginLifecycleService.installPlugin(
          GLOBAL_TENANT_ID,
          id,
          request.body ?? {}
        );
        return reply.code(200).send(result);
      } catch (error: unknown) {
        request.log.error({ pluginId: id, error }, 'installPlugin failed');
        const message = error instanceof Error ? error.message : 'Installation failed';
        const status =
          message.includes('not found') || message.includes('not available') ? 404 : 400;
        return reply.code(status).send({
          error: { code: 'INSTALL_FAILED', message },
        });
      }
    }
  );

  /**
   * POST /api/v1/plugins/:id/enable
   * Activate a plugin globally (starts the container, transitions to ACTIVE).
   */
  fastify.post<{ Params: { id: string } }>(
    '/plugins/:id/enable',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const result = await pluginLifecycleService.activatePlugin(GLOBAL_TENANT_ID, id);
        return reply.code(200).send(result);
      } catch (error: unknown) {
        request.log.error({ pluginId: id, error }, 'activatePlugin failed');
        const message = error instanceof Error ? error.message : 'Activation failed';
        const status = message.includes('not found') ? 404 : 400;
        return reply.code(status).send({
          error: { code: 'ENABLE_FAILED', message },
        });
      }
    }
  );

  /**
   * POST /api/v1/plugins/:id/disable
   * Deactivate a plugin globally (stops the container, transitions to DISABLED).
   */
  fastify.post<{ Params: { id: string } }>(
    '/plugins/:id/disable',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const result = await pluginLifecycleService.deactivatePlugin(GLOBAL_TENANT_ID, id);
        return reply.code(200).send(result);
      } catch (error: unknown) {
        request.log.error({ pluginId: id, error }, 'deactivatePlugin failed');
        const message = error instanceof Error ? error.message : 'Deactivation failed';
        const status = message.includes('not found') ? 404 : 400;
        return reply.code(status).send({
          error: { code: 'DISABLE_FAILED', message },
        });
      }
    }
  );

  /**
   * POST /api/v1/plugins/:id/update
   * Update the plugin manifest/version in the registry.
   */
  fastify.post<{ Params: { id: string }; Body: PluginManifest }>(
    '/plugins/:id/update',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: PluginManifest }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      try {
        const result = await pluginRegistryService.updatePlugin(id, request.body);
        return reply.code(200).send(result);
      } catch (error: unknown) {
        request.log.error({ pluginId: id, error }, 'updatePlugin failed');
        const message = error instanceof Error ? error.message : 'Update failed';
        const status = message.includes('not found') ? 404 : 400;
        return reply.code(status).send({
          error: { code: 'UPDATE_FAILED', message },
        });
      }
    }
  );

  /**
   * DELETE /api/v1/plugins/:id
   * Uninstall a plugin globally (removes the container, cleans up state).
   */
  fastify.delete<{ Params: { id: string } }>(
    '/plugins/:id',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        await pluginLifecycleService.uninstallPlugin(GLOBAL_TENANT_ID, id);
        return reply.code(200).send({ success: true });
      } catch (error: unknown) {
        request.log.error({ pluginId: id, error }, 'uninstallPlugin failed');
        const message = error instanceof Error ? error.message : 'Uninstall failed';
        const status = message.includes('not found') ? 404 : 400;
        return reply.code(status).send({
          error: { code: 'UNINSTALL_FAILED', message },
        });
      }
    }
  );

  // =========================================================================
  // T004-11 — Health-check proxy endpoints
  // =========================================================================

  /**
   * GET /api/v1/plugins/:id/health
   * Proxy to <container>/health with Redis caching (TTL 10s).
   * Returns 503 when plugin is not ACTIVE or container is unreachable.
   */
  fastify.get<{ Params: { id: string } }>(
    '/plugins/:id/health',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      // Guard: plugin must be ACTIVE
      try {
        const plugin = await pluginRegistryService.getPlugin(id);
        if ((plugin as any).lifecycleStatus !== PluginLifecycleStatus.ACTIVE) {
          return reply.code(503).send({
            error: { code: 'PLUGIN_NOT_ACTIVE', message: 'Plugin is not currently active' },
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Plugin not found';
        return reply.code(404).send({
          error: { code: 'PLUGIN_NOT_FOUND', message },
        });
      }

      // Check Redis cache first
      const cacheKey = `plugin:health:${id}`;
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return reply.code(200).send(JSON.parse(cached));
        }
      } catch {
        // Cache miss is not fatal — fall through to live fetch
      }

      // Proxy to container
      const baseUrl = resolveContainerBaseUrl(id);
      try {
        const result = await proxyToContainer(`${baseUrl}/health`, CONTAINER_PROXY_TIMEOUT_MS);
        // Cache the result
        try {
          await redis.set(cacheKey, JSON.stringify(result), 'EX', HEALTH_CACHE_TTL_S);
        } catch {
          // Cache write failure is non-fatal
        }
        return reply.code(200).send(result);
      } catch (error: unknown) {
        request.log.warn({ pluginId: id, error }, 'Plugin container health check failed');
        return reply.code(503).send({
          error: { code: 'PLUGIN_UNREACHABLE', message: 'Plugin container is unreachable' },
        });
      }
    }
  );

  /**
   * GET /api/v1/plugins/:id/ready
   * Proxy to <container>/ready — no caching (liveness probe, must be live).
   * Returns 503 when plugin is not ACTIVE or container is unreachable.
   */
  fastify.get<{ Params: { id: string } }>(
    '/plugins/:id/ready',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      // Guard: plugin must be ACTIVE
      try {
        const plugin = await pluginRegistryService.getPlugin(id);
        if ((plugin as any).lifecycleStatus !== PluginLifecycleStatus.ACTIVE) {
          return reply.code(503).send({
            error: { code: 'PLUGIN_NOT_ACTIVE', message: 'Plugin is not currently active' },
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Plugin not found';
        return reply.code(404).send({
          error: { code: 'PLUGIN_NOT_FOUND', message },
        });
      }

      // Always proxy live (no cache for readiness probe)
      const baseUrl = resolveContainerBaseUrl(id);
      try {
        const result = await proxyToContainer(`${baseUrl}/ready`, CONTAINER_PROXY_TIMEOUT_MS);
        return reply.code(200).send(result);
      } catch (error: unknown) {
        request.log.warn({ pluginId: id, error }, 'Plugin container readiness check failed');
        return reply.code(503).send({
          error: { code: 'PLUGIN_UNREACHABLE', message: 'Plugin container is unreachable' },
        });
      }
    }
  );

  /**
   * GET /api/v1/plugins/:id/openapi
   * Proxy to <container>/openapi.json — no caching.
   * Returns 503 when plugin is not ACTIVE or container is unreachable.
   */
  fastify.get<{ Params: { id: string } }>(
    '/plugins/:id/openapi',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      // Guard: plugin must be ACTIVE
      try {
        const plugin = await pluginRegistryService.getPlugin(id);
        if ((plugin as any).lifecycleStatus !== PluginLifecycleStatus.ACTIVE) {
          return reply.code(503).send({
            error: { code: 'PLUGIN_NOT_ACTIVE', message: 'Plugin is not currently active' },
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Plugin not found';
        return reply.code(404).send({
          error: { code: 'PLUGIN_NOT_FOUND', message },
        });
      }

      // Proxy to container
      const baseUrl = resolveContainerBaseUrl(id);
      try {
        const result = await proxyToContainer(
          `${baseUrl}/openapi.json`,
          CONTAINER_PROXY_TIMEOUT_MS
        );
        return reply.code(200).send(result);
      } catch (error: unknown) {
        request.log.warn({ pluginId: id, error }, 'Plugin container OpenAPI fetch failed');
        return reply.code(503).send({
          error: { code: 'PLUGIN_UNREACHABLE', message: 'Plugin container is unreachable' },
        });
      }
    }
  );

  /**
   * GET /api/v1/plugins/stats
   * Returns per-lifecycle-status counts for the registry stat summary bar.
   * Server-side aggregation avoids fetching hundreds of full entities client-side.
   *
   * Response: { total: number, REGISTERED: number, INSTALLING: number,
   *             INSTALLED: number, ACTIVE: number, DISABLED: number,
   *             UNINSTALLING: number, UNINSTALLED: number }
   */
  fastify.get(
    '/plugins/stats',
    { preHandler: [authMiddleware, requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { plugins } = await pluginRegistryService.listPlugins({});
        const counts: Record<string, number> = { total: plugins.length };
        for (const plugin of plugins as any[]) {
          const ls: string = plugin.lifecycleStatus ?? 'REGISTERED';
          counts[ls] = (counts[ls] ?? 0) + 1;
        }
        return reply.code(200).send(counts);
      } catch (error: unknown) {
        request.log.error(error, 'getPluginStats failed');
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Unexpected error',
          },
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // T004-13: Public — Module Federation remote entry discovery
  // GET /api/v1/plugins/remotes
  // No auth guard — the frontend shell calls this on startup before the user logs in.
  // Returns all ACTIVE plugins that have a remoteEntryUrl registered.
  // ---------------------------------------------------------------------------

  fastify.get('/remotes', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const remotes = await moduleFederationRegistryService.getActiveRemoteEntries();
      return reply.code(200).send(remotes);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: msg },
      });
    }
  });
}
