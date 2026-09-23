// translation-routes.ts
// Fastify plugin — tenant translation override routes (006-10).
//
// Registered in the tenant scope (authMiddleware + tenantContextMiddleware +
// userProfileResolver run automatically — see index.ts). The scope already
// guarantees an authenticated, tenant-resolved user on every handler here.
//
// Access model:
//   GET /api/v1/tenant/translations  — any authenticated tenant user (read)
//   PUT /api/v1/tenant/translations/:key — tenant_admin only (settings-module
//       ABAC guard, plan §5.5: "reuses the tenant-settings admin guard").

import { withTenantDb } from '../../lib/tenant-database.js';
import { parseOrThrow } from '../../lib/validation.js';
import { requireAbac } from '../../middleware/abac.js';
import { SETTINGS_RATE_LIMIT } from '../../lib/rate-limit-config.js';

import { putTranslationSchema, translationKeyParamSchema } from './schema.js';
import { getTranslationOverrides, upsertTranslation } from './translation-service.js';

import type { FastifyInstance } from 'fastify';
import type { UpsertTranslationInput } from './types.js';

export async function translationRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/tenant/translations ──────────────────────────────────────
  // Any tenant user reads every override for this tenant (plan §5.5).
  fastify.get(
    '/api/v1/tenant/translations',
    {
      config: { rateLimit: SETTINGS_RATE_LIMIT },
    },
    async (request) => {
      return withTenantDb((db) => getTranslationOverrides(db), request.tenantContext);
    }
  );

  // ── PUT /api/v1/tenant/translations/:key ─────────────────────────────────
  // tenant_admin guard — same ABAC action the settings module uses. Empty
  // `value` deletes the row (revert to default).
  fastify.put(
    '/api/v1/tenant/translations/:key',
    {
      preHandler: [requireAbac('settings:update')],
      config: { rateLimit: SETTINGS_RATE_LIMIT },
    },
    async (request) => {
      const { key } = parseOrThrow(translationKeyParamSchema, request.params);
      const parsed = parseOrThrow(putTranslationSchema, request.body) as Pick<
        UpsertTranslationInput,
        'locale' | 'value'
      >;
      return withTenantDb(
        (db) => upsertTranslation(db, request.user.id, { key, ...parsed }),
        request.tenantContext
      );
    }
  );
}