/**
 * Translation API Routes
 *
 * Endpoints:
 * - GET /api/v1/translations/:locale/:namespace - Get translations (stable URL, public)
 * - GET /api/v1/translations/:locale/:namespace/:hash - Get translations by content hash (immutable, public)
 * - GET /api/v1/translations/locales - List available locales (public)
 * - GET /api/v1/tenant/translations/overrides - Get tenant overrides (authenticated)
 * - PUT /api/v1/tenant/translations/overrides - Update tenant overrides (authenticated + tenant_admin)
 *
 * @module modules/i18n/i18n.controller
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TranslationService } from './i18n.service.js';
import { TranslationCacheService } from './i18n-cache.service.js';
import { generateSecureETag } from '../../lib/crypto.js';
import {
  LocaleCodeSchema,
  NamespaceSchema,
  ContentHashSchema,
  GetTranslationsQuerySchema,
  TranslationOverridePayloadSchema,
  type GetTranslationsParams,
  type GetTranslationsQuery,
  type GetTranslationsByHashParams,
  type TranslationOverridePayload,
} from './i18n.schemas.js';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.js';
import { getTenantContext } from '../../middleware/tenant-context.js';
import { tenantService } from '../../services/tenant.service.js';

// Initialize services
const translationService = new TranslationService();
const cacheService = new TranslationCacheService();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * C3: Compare a client-supplied If-None-Match header value against an expected
 * ETag string, handling both strong (`"abc"`) and weak (`W/"abc"`) ETag forms
 * per RFC 7232 §2.3.  The raw `.replace(/^"|"$/g, '')` approach fails for
 * weak ETags — CDN revalidations with `W/"..."` headers always got 200 instead
 * of 304.
 */
function matchesETag(header: string, expected: string): boolean {
  // Strip strong form: "abc123" → abc123
  // Strip weak form:   W/"abc123" → abc123
  const clean = header.replace(/^(?:W\/)?"(.*)"$/, '$1');
  return clean === expected;
}

/**
 * W6: Centralised error handler for the two public translation route handlers.
 * Replaces duplicated fragile `errorMessage.includes('...')` string matching
 * with a single function that applies Art. 6.1 typed-error routing.
 *
 * Error codes emitted by TranslationService use the `ERROR_CODES` prefix pattern
 * (e.g. "LOCALE_NOT_FOUND: ..."), so we still test with `includes` but only in
 * one place. Future work can replace these with typed error classes (TD-006).
 */
function handleI18nError(
  error: unknown,
  reply: FastifyReply,
  fastify: FastifyInstance,
  logLabel: string
): ReturnType<FastifyReply['status']> {
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

  fastify.log.error({ error }, logLabel);
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch translations',
    },
  });
}

/**
 * W7: Extract tenant context from AsyncLocalStorage with a fallback to the
 * authenticated user's tenantSlug for tests / environments where the context
 * middleware is not mounted.
 *
 * Returns `{ tenantId, tenantSlug? }` or `null` when no tenant context is
 * available (caller is responsible for returning 403).
 */
async function resolveTenantContext(
  request: { user?: { tenantSlug?: string } | null },
  svc: typeof tenantService
): Promise<{ tenantId: string; tenantSlug?: string } | null> {
  const tenantContext = getTenantContext();

  if (tenantContext?.tenantId) {
    return {
      tenantId: tenantContext.tenantId,
      tenantSlug: tenantContext.tenantSlug,
    };
  }

  if (request.user?.tenantSlug) {
    const tenant = await svc.getTenantBySlug(request.user.tenantSlug);
    if (tenant) {
      return { tenantId: tenant.id, tenantSlug: tenant.slug };
    }
  }

  return null;
}

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

const getTranslationsByHashSchema = {
  params: {
    type: 'object',
    required: ['locale', 'namespace', 'hash'],
    properties: {
      locale: { type: 'string', description: 'BCP 47 locale code (e.g., en, it)' },
      namespace: { type: 'string', description: 'Plugin namespace (e.g., core, crm)' },
      hash: {
        type: 'string',
        description: '8-character lowercase hex content hash (NFR-005)',
        // NOTE: No `pattern` here — Zod (ContentHashSchema) handles format validation
        // exclusively. A Fastify JSON Schema `pattern` would fire first and return a
        // non-standard 400 payload ({ message, error, statusCode }) that bypasses our
        // Art. 6.2 error format { error: { code, message } }. (MEDIUM-4 fix)
      },
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
              name: { type: 'string' },
              nativeName: { type: 'string' },
              namespaceCount: { type: 'number' },
            },
          },
        },
        defaultLocale: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
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
      preHandler: optionalAuthMiddleware,
      schema: {
        description: 'Get translations for a specific locale and namespace',
        tags: ['translations'],
        params: getTranslationsSchema.params,
        querystring: getTranslationsSchema.querystring,
      },
    },
    async (request, reply) => {
      const { locale, namespace } = request.params;

      try {
        // W2: Validate tenant slug format before use (Constitution Art. 5.3)
        const { tenant } = GetTranslationsQuerySchema.parse(request.query);

        // H-001: If a tenant slug is provided, require authentication
        // and verify the user belongs to that tenant.
        // W4: This route has no preHandler: authMiddleware. Authentication is
        // optional — unauthenticated requests receive global translations.
        // When ?tenant= is present we enforce authentication inline below.
        if (tenant) {
          if (!request.user) {
            return reply.status(401).send({
              error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required to access tenant-specific translations',
              },
            });
          }
          // Verify the authenticated user belongs to the requested tenant
          const userTenantSlug = request.user.tenantSlug;
          if (userTenantSlug !== tenant) {
            return reply.status(403).send({
              error: {
                code: 'FORBIDDEN',
                message: 'You do not have access to translations for this tenant',
              },
            });
          }
        }

        // Validate locale and namespace format
        LocaleCodeSchema.parse(locale);
        NamespaceSchema.parse(namespace);

        // Check ETag header for 304 Not Modified support
        // Use HMAC-based ETag to prevent cache poisoning attacks
        const clientETag = request.headers['if-none-match'];
        const cachedHash = await cacheService.getHash(locale, namespace, tenant);

        if (clientETag && cachedHash) {
          const secureETag = generateSecureETag(cachedHash);
          // C3: Use matchesETag() to handle both strong ("abc") and weak (W/"abc")
          // ETag forms per RFC 7232. Raw .replace(/^"|"$/) strips only the outer
          // quotes — weak ETags from CDN revalidations always got 200 instead of 304.
          if (matchesETag(clientETag, secureETag)) {
            return reply.status(304).send();
          }
        }

        // Try to get from cache first
        let bundle = await cacheService.getCached(locale, namespace, tenant);

        if (!bundle) {
          // Cache miss - load from service
          bundle = await translationService.getTranslations(locale, namespace, tenant);

          // Store in cache
          await cacheService.setCached(bundle, tenant);
        }

        // Set cache headers for stable URL (NFR-005 / TD-013)
        // Stable URL is MUTABLE — browsers/CDNs must revalidate periodically.
        // ETag enables efficient conditional requests (304 Not Modified).
        // stale-while-revalidate lets clients serve stale content while fetching fresh.
        // X-Translation-Hash exposes the content hash so the frontend can build
        // content-addressed URLs for fully immutable caching.
        const secureETag = generateSecureETag(bundle.hash);
        reply
          .header('Cache-Control', 'public, max-age=60, stale-while-revalidate=3600')
          .header('ETag', `"${secureETag}"`)
          .header('X-Translation-Hash', bundle.hash)
          .header('Content-Type', 'application/json; charset=utf-8')
          .send(bundle);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_LOCALE',
              message: 'Invalid locale, namespace, or tenant format',
              details: error.issues,
            },
          });
        }

        return handleI18nError(error, reply, fastify, 'Translation fetch error');
      }
    }
  );

  /**
   * GET /api/v1/translations/:locale/:namespace/:hash
   *
   * Content-addressed translation endpoint (NFR-005 / TD-013).
   *
   * - If the client-supplied :hash matches the current bundle hash → 200 with
   *   `Cache-Control: public, immutable, max-age=31536000`.  Browsers and CDNs
   *   may cache this response permanently; the URL itself encodes freshness.
   * - If the :hash is stale (content has since been updated) → 302 Temporary
   *   Redirect to the current content-addressed URL.  302 is chosen over 301
   *   because 301 is cached permanently by browsers, creating growing redirect
   *   chains on each translation update.  The redirect carries
   *   `Cache-Control: no-store` so browsers never cache the redirect itself.
   *
   * Auth: same as stable URL — unauthenticated for global content; ?tenant=<slug>
   * requires the caller to be authenticated and belong to that tenant.
   */
  fastify.get<{
    Params: GetTranslationsByHashParams;
    Querystring: GetTranslationsQuery;
  }>(
    '/translations/:locale/:namespace/:hash',
    {
      preHandler: optionalAuthMiddleware,
      schema: {
        description:
          'Get translations by content hash — returns immutably-cacheable bundle or 302 redirect to current hash (NFR-005)',
        tags: ['translations'],
        params: getTranslationsByHashSchema.params,
        querystring: getTranslationsByHashSchema.querystring,
      },
    },
    async (request, reply) => {
      const { locale, namespace, hash } = request.params;

      try {
        // W2: Validate tenant slug format before use (Constitution Art. 5.3)
        const { tenant } = GetTranslationsQuerySchema.parse(request.query);

        // H-001: Tenant-scoped requests require authentication + tenant ownership.
        // W4: No preHandler: authMiddleware on this route — authentication is
        // optional for global content; enforced inline when ?tenant= is present.
        if (tenant) {
          if (!request.user) {
            return reply.status(401).send({
              error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required to access tenant-specific translations',
              },
            });
          }
          const userTenantSlug = request.user.tenantSlug;
          if (userTenantSlug !== tenant) {
            return reply.status(403).send({
              error: {
                code: 'FORBIDDEN',
                message: 'You do not have access to translations for this tenant',
              },
            });
          }
        }

        // Validate path parameter formats
        LocaleCodeSchema.parse(locale);
        NamespaceSchema.parse(namespace);
        ContentHashSchema.parse(hash);

        // Fetch the bundle (cache-first, same as stable URL)
        let bundle = await cacheService.getCached(locale, namespace, tenant);
        if (!bundle) {
          bundle = await translationService.getTranslations(locale, namespace, tenant);
          await cacheService.setCached(bundle, tenant);
        }

        const currentHash = bundle.hash;

        if (hash === currentHash) {
          // Hash matches — serve with fully immutable cache headers.
          // MEDIUM-8: Honour If-None-Match / 304 even on the immutable endpoint so
          // CDN edge revalidations (which send ETag) get a cheap 304 instead of a
          // full body transfer on every CDN node expiry.
          const secureETag = generateSecureETag(currentHash);
          const clientETagHashed = request.headers['if-none-match'];
          if (clientETagHashed) {
            // C3: Use matchesETag() to handle both strong and weak ETag forms.
            if (matchesETag(clientETagHashed, secureETag)) {
              return reply
                .header('Cache-Control', 'public, immutable, max-age=31536000')
                .header('ETag', `"${secureETag}"`)
                .status(304)
                .send();
            }
          }
          return reply
            .header('Cache-Control', 'public, immutable, max-age=31536000')
            .header('ETag', `"${secureETag}"`)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send(bundle);
        }

        // Hash is stale — 302 temporary redirect to current content-addressed URL.
        // HIGH-2: Use 302 (not 301) — 301 would be permanently cached by browsers,
        // creating an ever-growing redirect chain on each translation update.
        // HIGH-3: Re-validate bundle.locale via Zod before embedding in Location
        // header to prevent HTTP response-splitting via a malformed Redis-cached value.
        const safeLocale = LocaleCodeSchema.parse(bundle.locale);
        const tenantQuery = tenant ? `?tenant=${encodeURIComponent(tenant)}` : '';
        const redirectUrl = `/api/v1/translations/${safeLocale}/${namespace}/${currentHash}${tenantQuery}`;
        return reply.header('Cache-Control', 'no-store').redirect(redirectUrl, 302);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid locale, namespace, hash, or tenant format',
              details: error.issues,
            },
          });
        }

        return handleI18nError(error, reply, fastify, 'Translation fetch error (hashed endpoint)');
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
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch available locales',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/tenant/translations/namespaces
   * Get available translation namespaces for the tenant
   * Requires authentication
   */
  fastify.get(
    '/tenant/translations/namespaces',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Get available translation namespaces from core and enabled plugins',
        tags: ['translations', 'tenant'],
      },
    },
    async (request, reply) => {
      try {
        // W7: resolveTenantContext() deduplicates the 3-handler pattern of
        // extracting tenantId from AsyncLocalStorage or falling back to
        // request.user.tenantSlug for tests / non-middleware environments.
        const ctx = await resolveTenantContext(request, tenantService);

        if (!ctx) {
          return reply.status(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'No tenant context available',
            },
          });
        }

        const namespaces = await translationService.getEnabledNamespaces(ctx.tenantId);

        return reply.send({ namespaces });
      } catch (error) {
        fastify.log.error({ error }, 'Namespace list error');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch available namespaces',
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
        // W7: Use shared resolveTenantContext() helper
        const ctx = await resolveTenantContext(request, tenantService);

        if (!ctx) {
          return reply.status(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'No tenant context available',
            },
          });
        }

        const overrides = await translationService.getTenantOverrides(ctx.tenantId);

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
      bodyLimit: 1024 * 1024, // 1MB limit enforced by Fastify parser (prevents DoS)
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

        // W7: Use shared resolveTenantContext() helper
        const ctx = await resolveTenantContext(request, tenantService);

        if (!ctx?.tenantId || !ctx?.tenantSlug) {
          return reply.status(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'No tenant context available',
            },
          });
        }

        const { tenantId, tenantSlug } = ctx;

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

        // Validate no empty string values (security: prevent bypass of client-side deletion logic)
        for (const locale of Object.keys(overrides)) {
          for (const namespace of Object.keys(overrides[locale] || {})) {
            for (const [key, value] of Object.entries(overrides[locale][namespace] || {})) {
              if (typeof value === 'string' && value.trim() === '') {
                return reply.status(400).send({
                  error: {
                    code: 'INVALID_TRANSLATION_VALUE',
                    message: `Empty translation value not allowed for key "${key}". Remove the key entirely instead.`,
                  },
                });
              }
            }
          }
        }

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
