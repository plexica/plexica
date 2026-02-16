/**
 * Translation API Routes
 *
 * Endpoints:
 * - GET /api/v1/translations/:locale/:namespace - Get translations (public)
 * - GET /api/v1/translations/locales - List available locales (public)
 * - GET /api/v1/tenant/translations/overrides - Get tenant overrides (authenticated)
 * - PUT /api/v1/tenant/translations/overrides - Update tenant overrides (authenticated + tenant_admin)
 *
 * @module modules/i18n/i18n.controller
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TranslationService } from './i18n.service.js';
import { TranslationCacheService } from './i18n-cache.service.js';
import {
  LocaleCodeSchema,
  NamespaceSchema,
  TranslationOverridePayloadSchema,
  type GetTranslationsParams,
  type GetTranslationsQuery,
  type TranslationOverridePayload,
} from './i18n.schemas.js';
import { authMiddleware } from '../../middleware/auth.js';
import { getTenantContext } from '../../middleware/tenant-context.js';
import { tenantService } from '../../services/tenant.service.js';
import { z } from 'zod';

// Initialize services
const translationService = new TranslationService();
const cacheService = new TranslationCacheService();

// JSON Schemas for Fastify validation
const getTranslationsSchema = {
  params: {
    type: 'object',
    required: ['locale', 'namespace'],
    properties: {
      locale: { type: 'string', description: 'BCP 47 locale code (e.g., en, it)' },
      namespace: { type: 'string', description: 'Plugin namespace (e.g., core, crm)' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      tenant: {
        type: 'string',
        description: 'Tenant slug for tenant-specific overrides',
      },
    },
  },
};

const listLocalesSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        locales: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              displayName: { type: 'string' },
              isRTL: { type: 'boolean' },
            },
          },
        },
        defaultLocale: { type: 'string' },
      },
    },
  },
};

const updateOverridesSchema = {
  body: {
    type: 'object',
    required: ['overrides'],
    properties: {
      overrides: {
        type: 'object',
        description: 'Nested structure: { locale: { namespace: { key: value } } }',
      },
    },
  },
};

/**
 * Register translation routes with Fastify
 *
 * @param fastify - Fastify instance
 */
export async function translationRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/translations/:locale/:namespace
   * Get translations for a specific locale and namespace
   * Public endpoint with ETag/304 support
   */
  fastify.get<{
    Params: GetTranslationsParams;
    Querystring: GetTranslationsQuery;
  }>(
    '/translations/:locale/:namespace',
    {
      schema: {
        description: 'Get translations for a specific locale and namespace',
        tags: ['translations'],
        params: getTranslationsSchema.params,
        querystring: getTranslationsSchema.querystring,
      },
    },
    async (request, reply) => {
      const { locale, namespace } = request.params;
      const { tenant } = request.query;

      try {
        // Validate locale and namespace format
        LocaleCodeSchema.parse(locale);
        NamespaceSchema.parse(namespace);

        // Check ETag header for 304 Not Modified support
        const clientETag = request.headers['if-none-match'];
        const cachedHash = await cacheService.getHash(locale, namespace, tenant);

        if (clientETag && cachedHash && clientETag === `"${cachedHash}"`) {
          return reply.status(304).send();
        }

        // Try to get from cache first
        let bundle = await cacheService.getCached(locale, namespace, tenant);

        if (!bundle) {
          // Cache miss - load from service
          bundle = await translationService.getTranslations(locale, namespace, tenant);

          // Store in cache
          await cacheService.setCached(bundle, tenant);
        }

        // Set cache headers for immutable content (FR-010)
        reply
          .header('Cache-Control', 'public, immutable, max-age=31536000')
          .header('ETag', `"${bundle.contentHash}"`)
          .header('Content-Type', 'application/json; charset=utf-8')
          .send(bundle);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_LOCALE',
              message: 'Invalid locale or namespace format',
              details: error.issues,
            },
          });
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('LOCALE_NOT_FOUND')) {
          return reply.status(404).send({
            error: {
              code: 'LOCALE_NOT_FOUND',
              message: errorMessage.replace('LOCALE_NOT_FOUND: ', ''),
            },
          });
        }

        if (errorMessage.includes('NAMESPACE_NOT_FOUND')) {
          return reply.status(404).send({
            error: {
              code: 'NAMESPACE_NOT_FOUND',
              message: errorMessage.replace('NAMESPACE_NOT_FOUND: ', ''),
            },
          });
        }

        // Internal server error
        fastify.log.error({ error }, 'Translation fetch error');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch translations',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/translations/locales
   * List all available locales
   * Public endpoint
   */
  fastify.get(
    '/translations/locales',
    {
      schema: {
        description: 'List all available locales with metadata',
        tags: ['translations'],
        response: listLocalesSchema.response,
      },
    },
    async (_request, reply) => {
      try {
        const locales = await translationService.getAvailableLocales();

        return reply.send({
          locales,
          defaultLocale: 'en',
        });
      } catch (error) {
        fastify.log.error({ error }, 'Locale list error');
        return reply.send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch available locales',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/tenant/translations/overrides
   * Get tenant translation overrides
   * Requires authentication
   */
  fastify.get(
    '/tenant/translations/overrides',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Get tenant translation overrides',
        tags: ['translations', 'tenant'],
      },
    },
    async (request, reply) => {
      try {
        // Extract tenant context from AsyncLocalStorage or fallback to request.user
        const tenantContext = getTenantContext();
        let tenantId: string | undefined;

        if (tenantContext?.tenantId) {
          tenantId = tenantContext.tenantId;
        } else if (request.user?.tenantSlug) {
          // Fallback: Fetch tenant ID from slug (for tests or when context middleware not used)
          const tenant = await tenantService.getTenantBySlug(request.user.tenantSlug);
          tenantId = tenant?.id;
        }

        if (!tenantId) {
          return reply.status(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'No tenant context available',
            },
          });
        }

        const overrides = await translationService.getTenantOverrides(tenantId);

        return reply.send({
          overrides,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('TENANT_NOT_FOUND')) {
          return reply.status(404).send({
            error: {
              code: 'TENANT_NOT_FOUND',
              message: errorMessage.replace('TENANT_NOT_FOUND: ', ''),
            },
          });
        }

        fastify.log.error({ error }, 'Get overrides error');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch tenant overrides',
          },
        });
      }
    }
  );

  /**
   * PUT /api/v1/tenant/translations/overrides
   * Update tenant translation overrides
   * Requires authentication + tenant_admin role
   */
  fastify.put<{
    Body: TranslationOverridePayload;
  }>(
    '/tenant/translations/overrides',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Update tenant translation overrides',
        tags: ['translations', 'tenant'],
        body: updateOverridesSchema.body,
      },
    },
    async (request, reply) => {
      try {
        // RBAC: Enforce tenant_admin role requirement
        if (!request.user?.roles?.includes('tenant_admin')) {
          return reply.status(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'tenant_admin role required to update translation overrides',
            },
          });
        }

        // Extract tenant context from AsyncLocalStorage or fallback to request.user
        const tenantContext = getTenantContext();
        let tenantId: string | undefined;
        let tenantSlug: string | undefined;

        if (tenantContext?.tenantId && tenantContext?.tenantSlug) {
          tenantId = tenantContext.tenantId;
          tenantSlug = tenantContext.tenantSlug;
        } else if (request.user?.tenantSlug) {
          // Fallback: Fetch tenant from slug (for tests or when context middleware not used)
          const tenant = await tenantService.getTenantBySlug(request.user.tenantSlug);
          tenantId = tenant?.id;
          tenantSlug = tenant?.slug;
        }

        if (!tenantId || !tenantSlug) {
          return reply.status(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'No tenant context available',
            },
          });
        }

        // Validate request body
        const validation = TranslationOverridePayloadSchema.safeParse(request.body);
        if (!validation.success) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_TRANSLATION_KEY',
              message: 'Invalid override payload',
              details: validation.error.issues,
            },
          });
        }

        const { overrides } = validation.data;

        // Check payload size (max 1MB per FR-011)
        const payloadSize = JSON.stringify(overrides).length;
        if (payloadSize > 1024 * 1024) {
          return reply.status(413).send({
            error: {
              code: 'PAYLOAD_TOO_LARGE',
              message: 'Override payload exceeds 1MB limit',
              details: { size: payloadSize, limit: 1048576 },
            },
          });
        }

        // Update overrides
        const updated = await translationService.updateTenantOverrides(tenantId, overrides);

        // Invalidate cache for this tenant
        await cacheService.invalidateTenant(tenantSlug);

        return reply.send({
          overrides: updated,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('INVALID_TRANSLATION_KEY')) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_TRANSLATION_KEY',
              message: errorMessage.replace('INVALID_TRANSLATION_KEY: ', ''),
            },
          });
        }

        if (errorMessage.includes('TENANT_NOT_FOUND')) {
          return reply.status(404).send({
            error: {
              code: 'TENANT_NOT_FOUND',
              message: errorMessage.replace('TENANT_NOT_FOUND: ', ''),
            },
          });
        }

        fastify.log.error({ error }, 'Update overrides error');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to update tenant overrides',
          },
        });
      }
    }
  );
}
