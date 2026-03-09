// File: apps/core-api/src/modules/extension-registry/extension-registry.controller.ts
//
// Spec 013 — Extension Points (T013-07, T013-08)
// Fastify controller for Extension Registry API.
//
// Routes registered (all under /api/v1 prefix):
//   GET  /extension-registry/slots                                         (FR-019)
//   GET  /extension-registry/slots/:pluginId                               (FR-019)
//   GET  /extension-registry/contributions                                 (FR-021)
//   GET  /extension-registry/slots/:pluginId/:slotId/dependents            (FR-031)
//   GET  /extension-registry/entities                                      (FR-020)
//   GET  /extension-registry/entities/:pluginId/:entityType/:entityId/extensions  (FR-015)
//   PATCH /workspaces/:workspaceId/extension-visibility/:contributionId    (FR-022)
//   GET  /extension-registry/admin/slots                                   (ADR-031 Safeguard 3, W-12)
//   GET  /extension-registry/sync-status/:pluginId                        (W-8 operator observability)
//
// Constitution Art. 5.1: All routes require authentication.
// Constitution Art. 5.3: All external input validated with Zod.
// Constitution Art. 6.2: Standard error response { error: { code, message } }.
// ADR-031 Safeguard 1: All data access via ExtensionRegistryService → repo.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { extensionRegistryService } from './extension-registry.service.js';
import {
  GetSlotsQuerySchema,
  GetSlotsByPluginParamsSchema,
  GetContributionsQuerySchema,
  SlotDependentsParamsSchema,
  EntityExtensionParamsSchema,
  VisibilityPatchParamsSchema,
  VisibilityPatchSchema,
  SyncStatusParamsSchema,
  type GetSlotsQuery,
  type GetSlotsByPluginParams,
  type GetContributionsQuery,
  type SlotDependentsParams,
  type EntityExtensionParams,
  type VisibilityPatchParams,
  type VisibilityPatch,
  type SyncStatusParams,
} from './extension-registry.schema.js';
import { authMiddleware } from '../../middleware/auth.js';
import { getTenantContext } from '../../middleware/tenant-context.js';
import { tenantService } from '../../services/tenant.service.js';
import { authorizationService } from '../authorization/authorization.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves tenantId + tenant settings from AsyncLocalStorage or JWT fallback.
 * Returns null when no tenant context is available (caller returns 403).
 *
 * F-008 fix: collapsed the previous double round-trip (getTenantBySlug → getTenant)
 * into a single DB call. getTenantBySlug already returns the full tenant object
 * (including settings), so there is no need to call getTenant separately.
 * When the tenantId is already available from AsyncLocalStorage we still call
 * getTenant once to load settings; that single call is unavoidable.
 */
async function resolveTenant(request: {
  user?: { tenantSlug?: string } | null;
}): Promise<{ tenantId: string; schemaName: string; settings: Record<string, unknown> } | null> {
  const ctx = getTenantContext();

  if (ctx?.tenantId) {
    // Fast path: tenantId already in ALS context — one DB call to load settings.
    let tenant;
    try {
      tenant = await tenantService.getTenant(ctx.tenantId);
    } catch {
      return null;
    }
    return {
      tenantId: ctx.tenantId,
      schemaName: tenantService.getSchemaName(tenant.slug),
      settings: (tenant.settings as Record<string, unknown>) ?? {},
    };
  }

  if (request.user?.tenantSlug) {
    // Fallback: no ALS context — resolve by slug. getTenantBySlug returns the
    // full tenant object (id + settings) so no second call is needed (F-008).
    let tenant;
    try {
      tenant = await tenantService.getTenantBySlug(request.user.tenantSlug);
    } catch {
      return null;
    }
    return {
      tenantId: tenant.id,
      schemaName: tenantService.getSchemaName(tenant.slug),
      settings: (tenant.settings as Record<string, unknown>) ?? {},
    };
  }

  return null;
}

/**
 * Centralised error handler. Maps typed error codes from service layer to
 * HTTP status codes per Constitution Art. 6.1 + Art. 6.2.
 */
function handleExtensionError(
  error: unknown,
  reply: FastifyReply,
  fastify: FastifyInstance,
  logLabel: string
): ReturnType<FastifyReply['status']> {
  const msg = error instanceof Error ? error.message : 'Unknown error';

  if (msg.includes('EXTENSION_POINTS_DISABLED')) {
    return reply.status(404).send({
      error: {
        code: 'EXTENSION_POINTS_DISABLED',
        message: 'Extension points are not enabled for this tenant',
      },
    });
  }
  if (msg.includes('SLOT_NOT_FOUND')) {
    return reply.status(404).send({
      error: { code: 'SLOT_NOT_FOUND', message: msg.replace('SLOT_NOT_FOUND: ', '') },
    });
  }
  if (msg.includes('CONTRIBUTION_NOT_FOUND')) {
    return reply.status(404).send({
      error: {
        code: 'CONTRIBUTION_NOT_FOUND',
        message: msg.replace('CONTRIBUTION_NOT_FOUND: ', ''),
      },
    });
  }
  if (msg.includes('ENTITY_TYPE_NOT_FOUND')) {
    return reply.status(404).send({
      error: { code: 'ENTITY_TYPE_NOT_FOUND', message: msg.replace('ENTITY_TYPE_NOT_FOUND: ', '') },
    });
  }
  if (msg.includes('WORKSPACE_VISIBILITY_DENIED')) {
    return reply.status(403).send({
      error: {
        code: 'WORKSPACE_VISIBILITY_DENIED',
        message: msg.replace('WORKSPACE_VISIBILITY_DENIED: ', ''),
      },
    });
  }
  if (msg.includes('EXTENSION_PERMISSION_DENIED')) {
    return reply.status(403).send({
      error: {
        code: 'EXTENSION_PERMISSION_DENIED',
        message: msg.replace('EXTENSION_PERMISSION_DENIED: ', ''),
      },
    });
  }

  fastify.log.error({ error }, logLabel);
  return reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function extensionRegistryRoutes(fastify: FastifyInstance) {
  // ── GET /extension-registry/slots ─────────────────────────────────────────
  // FR-019: List all extension slots for the tenant, with optional filters.
  fastify.get<{ Querystring: GetSlotsQuery }>(
    '/extension-registry/slots',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'List extension slots for the tenant (FR-019)',
        tags: ['extension-registry'],
        querystring: {
          type: 'object',
          properties: {
            pluginId: { type: 'string' },
            type: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const ctx = await resolveTenant(request);
        if (!ctx) {
          return reply
            .status(403)
            .send({ error: { code: 'FORBIDDEN', message: 'No tenant context available' } });
        }

        const query = GetSlotsQuerySchema.safeParse(request.query);
        if (!query.success) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_QUERY',
              message: 'Invalid query parameters',
              details: query.error.issues,
            },
          });
        }

        const slots = await extensionRegistryService.getSlots(
          ctx.tenantId,
          ctx.settings,
          query.data
        );
        return reply.send({ slots });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_QUERY',
              message: 'Invalid query parameters',
              details: error.issues,
            },
          });
        }
        return handleExtensionError(error, reply, fastify, 'GET /extension-registry/slots error');
      }
    }
  );

  // ── GET /extension-registry/slots/:pluginId ────────────────────────────────
  // FR-019: List slots for a specific plugin.
  fastify.get<{ Params: GetSlotsByPluginParams }>(
    '/extension-registry/slots/:pluginId',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'List extension slots for a specific plugin (FR-019)',
        tags: ['extension-registry'],
        params: {
          type: 'object',
          required: ['pluginId'],
          properties: { pluginId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const ctx = await resolveTenant(request);
        if (!ctx) {
          return reply
            .status(403)
            .send({ error: { code: 'FORBIDDEN', message: 'No tenant context available' } });
        }

        const params = GetSlotsByPluginParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid route parameters',
              details: params.error.issues,
            },
          });
        }

        const slots = await extensionRegistryService.getSlotsByPlugin(
          ctx.tenantId,
          ctx.settings,
          params.data.pluginId
        );
        return reply.send({ slots });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid parameters',
              details: error.issues,
            },
          });
        }
        return handleExtensionError(
          error,
          reply,
          fastify,
          'GET /extension-registry/slots/:pluginId error'
        );
      }
    }
  );

  // ── GET /extension-registry/contributions ─────────────────────────────────
  // FR-021: List contributions with optional filters.
  fastify.get<{ Querystring: GetContributionsQuery }>(
    '/extension-registry/contributions',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'List extension contributions for the tenant (FR-021)',
        tags: ['extension-registry'],
        querystring: {
          type: 'object',
          properties: {
            slotId: { type: 'string' },
            workspaceId: { type: 'string' },
            pluginId: { type: 'string' },
            type: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const ctx = await resolveTenant(request);
        if (!ctx) {
          return reply
            .status(403)
            .send({ error: { code: 'FORBIDDEN', message: 'No tenant context available' } });
        }

        const query = GetContributionsQuerySchema.safeParse(request.query);
        if (!query.success) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_QUERY',
              message: 'Invalid query parameters',
              details: query.error.issues,
            },
          });
        }

        const contributions = await extensionRegistryService.getContributions(
          ctx.tenantId,
          ctx.settings,
          query.data
        );
        return reply.send({ contributions });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_QUERY',
              message: 'Invalid query parameters',
              details: error.issues,
            },
          });
        }
        return handleExtensionError(
          error,
          reply,
          fastify,
          'GET /extension-registry/contributions error'
        );
      }
    }
  );

  // ── GET /extension-registry/slots/:pluginId/:slotId/dependents ────────────
  // FR-031: Get plugins that depend on a specific slot.
  fastify.get<{ Params: SlotDependentsParams }>(
    '/extension-registry/slots/:pluginId/:slotId/dependents',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'List plugins that contribute to a specific slot (FR-031)',
        tags: ['extension-registry'],
        params: {
          type: 'object',
          required: ['pluginId', 'slotId'],
          properties: {
            pluginId: { type: 'string' },
            slotId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const ctx = await resolveTenant(request);
        if (!ctx) {
          return reply
            .status(403)
            .send({ error: { code: 'FORBIDDEN', message: 'No tenant context available' } });
        }

        const params = SlotDependentsParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid route parameters',
              details: params.error.issues,
            },
          });
        }

        const result = await extensionRegistryService.getSlotDependents(
          ctx.tenantId,
          ctx.settings,
          params.data.pluginId,
          params.data.slotId
        );
        return reply.send(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid parameters',
              details: error.issues,
            },
          });
        }
        return handleExtensionError(
          error,
          reply,
          fastify,
          'GET /extension-registry/slots/:pluginId/:slotId/dependents error'
        );
      }
    }
  );

  // ── GET /extension-registry/entities ──────────────────────────────────────
  // FR-020: List extensible entity types registered for the tenant.
  fastify.get(
    '/extension-registry/entities',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'List extensible entity types for the tenant (FR-020)',
        tags: ['extension-registry'],
      },
    },
    async (request, reply) => {
      try {
        const ctx = await resolveTenant(request);
        if (!ctx) {
          return reply
            .status(403)
            .send({ error: { code: 'FORBIDDEN', message: 'No tenant context available' } });
        }

        const entities = await extensionRegistryService.getEntities(ctx.tenantId, ctx.settings);
        return reply.send({ entities });
      } catch (error) {
        return handleExtensionError(
          error,
          reply,
          fastify,
          'GET /extension-registry/entities error'
        );
      }
    }
  );

  // ── GET /extension-registry/entities/:pluginId/:entityType/:entityId/extensions ──
  // FR-015, FR-017, FR-018: Aggregate sidecar data from all contributing plugins.
  fastify.get<{ Params: EntityExtensionParams }>(
    '/extension-registry/entities/:pluginId/:entityType/:entityId/extensions',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Aggregate sidecar extension data for an entity instance (FR-015)',
        tags: ['extension-registry'],
        params: {
          type: 'object',
          required: ['pluginId', 'entityType', 'entityId'],
          properties: {
            pluginId: { type: 'string' },
            entityType: { type: 'string' },
            entityId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const ctx = await resolveTenant(request);
        if (!ctx) {
          return reply
            .status(403)
            .send({ error: { code: 'FORBIDDEN', message: 'No tenant context available' } });
        }

        const params = EntityExtensionParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid route parameters',
              details: params.error.issues,
            },
          });
        }

        const aggregated = await extensionRegistryService.aggregateEntityExtensions(
          ctx.tenantId,
          ctx.settings,
          params.data.pluginId,
          params.data.entityType,
          params.data.entityId
        );
        return reply.send(aggregated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid parameters',
              details: error.issues,
            },
          });
        }
        return handleExtensionError(
          error,
          reply,
          fastify,
          'GET /extension-registry/entities/:pluginId/:entityType/:entityId/extensions error'
        );
      }
    }
  );

  // ── PATCH /workspaces/:workspaceId/extension-visibility/:contributionId ────
  // FR-022: Set workspace-level visibility for a contribution.
  // Requires workspace_admin or tenant_admin role (Constitution Art. 5.1).
  fastify.patch<{ Params: VisibilityPatchParams; Body: VisibilityPatch }>(
    '/workspaces/:workspaceId/extension-visibility/:contributionId',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Set workspace-level visibility for an extension contribution (FR-022)',
        tags: ['extension-registry', 'workspaces'],
        params: {
          type: 'object',
          required: ['workspaceId', 'contributionId'],
          properties: {
            workspaceId: { type: 'string', format: 'uuid' },
            contributionId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['isVisible'],
          properties: { isVisible: { type: 'boolean' } },
        },
      },
    },
    async (request, reply) => {
      try {
        // Resolve tenant context first so we have tenantId + schemaName for ABAC.
        const ctx = await resolveTenant(request);
        if (!ctx) {
          return reply
            .status(403)
            .send({ error: { code: 'FORBIDDEN', message: 'No tenant context available' } });
        }

        // ABAC: require extension_visibility:manage (FR-022, Constitution Art. 5.1).
        // authorizationService.authorize() is fail-closed (returns DENY on error).
        const userId = (request.user as { id?: string } | undefined)?.id ?? '';
        const authResult = await authorizationService.authorize(
          userId,
          ctx.tenantId,
          ctx.schemaName,
          ['extension_visibility:manage']
        );
        if (!authResult.permitted) {
          return reply.status(403).send({
            error: {
              code: 'WORKSPACE_VISIBILITY_DENIED',
              message: 'Insufficient permissions to manage extension visibility',
            },
          });
        }

        const params = VisibilityPatchParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid route parameters',
              details: params.error.issues,
            },
          });
        }

        const body = VisibilityPatchSchema.safeParse(request.body);
        if (!body.success) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_BODY',
              message: 'Invalid request body',
              details: body.error.issues,
            },
          });
        }

        const result = await extensionRegistryService.setVisibility(
          ctx.tenantId,
          ctx.settings,
          params.data.workspaceId,
          params.data.contributionId,
          body.data.isVisible
        );
        return reply.send(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid parameters',
              details: error.issues,
            },
          });
        }
        return handleExtensionError(
          error,
          reply,
          fastify,
          'PATCH /workspaces/:workspaceId/extension-visibility/:contributionId error'
        );
      }
    }
  );

  // ── GET /extension-registry/admin/slots ───────────────────────────────────
  // ADR-031 Safeguard 3: Cross-tenant admin endpoint — SUPER_ADMIN only.
  // W-12 fix: Role is derived from verified JWT (realm_access.roles), never from
  // a caller-supplied boolean. authorizationService.isSuperAdmin() is the gate.
  fastify.get(
    '/extension-registry/admin/slots',
    {
      preHandler: authMiddleware,
      schema: {
        description:
          'SUPER_ADMIN ONLY: List all extension slots across all tenants (ADR-031 Safeguard 3)',
        tags: ['extension-registry', 'admin'],
      },
    },
    async (request, reply) => {
      try {
        // Derive super-admin status from the verified Keycloak JWT.
        // request.token is populated by authMiddleware (KeycloakJwtPayload).
        const roles =
          (request.token as { realm_access?: { roles?: string[] } } | undefined)?.realm_access
            ?.roles ?? [];
        const isSuperAdmin = authorizationService.isSuperAdmin(roles);

        if (!isSuperAdmin) {
          return reply.status(403).send({
            error: {
              code: 'SUPER_ADMIN_REQUIRED',
              message: 'This endpoint requires super-admin privileges',
            },
          });
        }

        const slots = await extensionRegistryService.superAdminListAllSlots();
        return reply.send({ slots });
      } catch (error) {
        return handleExtensionError(
          error,
          reply,
          fastify,
          'GET /extension-registry/admin/slots error'
        );
      }
    }
  );

  // ── GET /extension-registry/sync-status/:pluginId ─────────────────────────
  // W-8 fix: Operator observability — read Redis-based sync status for a plugin.
  // Requires tenant context (same as other tenant-scoped routes).
  fastify.get<{ Params: SyncStatusParams }>(
    '/extension-registry/sync-status/:pluginId',
    {
      preHandler: authMiddleware,
      schema: {
        description:
          'Get extension manifest sync status for a plugin (operator observability, W-8)',
        tags: ['extension-registry'],
        params: {
          type: 'object',
          required: ['pluginId'],
          properties: { pluginId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const ctx = await resolveTenant(request);
        if (!ctx) {
          return reply
            .status(403)
            .send({ error: { code: 'FORBIDDEN', message: 'No tenant context available' } });
        }

        const params = SyncStatusParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid route parameters',
              details: params.error.issues,
            },
          });
        }

        const syncStatus = await extensionRegistryService.getSyncStatus(
          ctx.tenantId,
          params.data.pluginId
        );

        if (!syncStatus) {
          return reply.send({ pluginId: params.data.pluginId, status: 'not_started' });
        }

        return reply.send({ pluginId: params.data.pluginId, ...syncStatus });
      } catch (error) {
        return handleExtensionError(
          error,
          reply,
          fastify,
          'GET /extension-registry/sync-status/:pluginId error'
        );
      }
    }
  );
}
