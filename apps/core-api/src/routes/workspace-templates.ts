// apps/core-api/src/routes/workspace-templates.ts
//
// Workspace Templates API routes — Spec 011 Phase 2, FR-021, FR-022.
//
// Endpoints:
//   GET  /api/workspace-templates         List templates available to the tenant
//   GET  /api/workspace-templates/:id     Get a single template with its items
//
// Both endpoints require authenticated tenant context.
// Template listing is filtered to only include templates whose providing
// plugin is enabled for the tenant.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { workspaceTemplateService } from '../modules/workspace/workspace-template.service.js';
import { tenantContextMiddleware } from '../middleware/tenant-context.js';
import { authMiddleware } from '../middleware/auth.js';
import { mapServiceError } from '../modules/workspace/utils/error-formatter.js';
import { rateLimiter, WORKSPACE_RATE_LIMITS } from '../middleware/rate-limiter.js';

/**
 * Map service errors to structured Art. 6.2 responses.
 * Sends the response directly to avoid FST_ERR_FAILED_ERROR_SERIALIZATION.
 */
function handleServiceError(error: unknown, reply: FastifyReply): never {
  const mapped = mapServiceError(error);
  if (mapped) {
    reply.status(mapped.statusCode).send({
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details ? { details: mapped.details } : {}),
      },
    });
    throw new Error('Response sent');
  }
  throw error;
}

// --- Shared error response schema (Constitution Art. 6.2) ---
const errorResponseSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object', additionalProperties: true },
      },
      required: ['code', 'message'],
    },
  },
  required: ['error'],
};

export async function workspaceTemplatesRoutes(fastify: FastifyInstance): Promise<void> {
  // ────────────────────────────────────────────────────────────────
  // GET /workspace-templates — List templates available to tenant
  // Spec 011 Phase 2, FR-021 — authenticated tenant context required
  // ────────────────────────────────────────────────────────────────
  fastify.get(
    '/workspace-templates',
    {
      schema: {
        tags: ['workspaces'],
        summary: 'List workspace templates',
        description:
          'Lists all workspace templates whose providing plugin is enabled for the tenant. ' +
          'Ordered by name ascending.',
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                description: { type: ['string', 'null'] },
                provided_by_plugin_id: { type: 'string' },
                is_default: { type: 'boolean' },
                metadata: { type: 'object', additionalProperties: true },
                created_at: { type: 'string', format: 'date-time' },
                item_count: { type: 'number' },
              },
              required: [
                'id',
                'name',
                'provided_by_plugin_id',
                'is_default',
                'metadata',
                'created_at',
                'item_count',
              ],
            },
          },
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware],
    },
    async (request, reply) => {
      try {
        const tenantId = request.tenant!.tenantId;
        const templates = await workspaceTemplateService.listTemplates(tenantId);
        return reply.send(templates);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /workspace-templates/:id — Get template with items
  // Spec 011 Phase 2, FR-022 — authenticated tenant context required
  // ────────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/workspace-templates/:id',
    {
      schema: {
        tags: ['workspaces'],
        summary: 'Get workspace template',
        description:
          'Returns a single workspace template with all its items, ordered by sort_order.',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Template UUID' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              description: { type: ['string', 'null'] },
              provided_by_plugin_id: { type: 'string' },
              is_default: { type: 'boolean' },
              metadata: { type: 'object', additionalProperties: true },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    template_id: { type: 'string', format: 'uuid' },
                    type: { type: 'string', enum: ['plugin', 'page', 'setting'] },
                    plugin_id: { type: ['string', 'null'] },
                    page_config: { type: ['object', 'null'], additionalProperties: true },
                    setting_key: { type: ['string', 'null'] },
                    setting_value: {},
                    sort_order: { type: 'number' },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                  required: ['id', 'template_id', 'type', 'sort_order', 'created_at'],
                },
              },
            },
            required: [
              'id',
              'name',
              'provided_by_plugin_id',
              'is_default',
              'metadata',
              'created_at',
              'updated_at',
              'items',
            ],
          },
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const template = await workspaceTemplateService.getTemplate(id);
        return reply.send(template);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );
}
