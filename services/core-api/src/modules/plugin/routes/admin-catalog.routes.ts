// routes/admin-catalog.routes.ts
// Super admin catalog: list + register plugins.

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { ValidationError } from '../../../lib/app-error.js';
import { parseOrThrow, stripUndefined } from '../../../lib/validation.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { registerPluginSchema } from '../schema/api.js';
import { createPlugin, listPlugins } from '../services/registry.service.js';
import { validateManifest } from '../services/manifest-validator.service.js';
import { countPluginInstallationsBatch } from '../services/plugin-install-count.service.js';

import type { FastifyInstance } from 'fastify';
import type { PluginListOptions, PluginRecord } from '../services/registry.service.js';

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function adminCatalogRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/admin/plugins ──────────────────────────────────────────────
  fastify.get('/api/v1/admin/plugins', { preHandler: [requireSuperAdmin] }, async (request) => {
    const query = parseOrThrow(listQuerySchema, request.query);
    // exactOptionalPropertyTypes: drop undefined-valued keys from the options.
    const options: PluginListOptions = stripUndefined({
      search: query.search,
      status: query.status,
      category: query.category,
      page: query.page,
      pageSize: query.pageSize,
    });

    const page = await withCoreDb((prisma) => listPlugins(prisma, options));

    // S5-801: augment catalog-safe rows with platform-wide active installedCount.
    const pluginIds = page.data.map((p) => p.id);
    const counts = await withCoreDb((prisma) => countPluginInstallationsBatch(prisma, pluginIds));

    const data = page.data.map((p) => ({
      ...p,
      installedCount: counts.get(p.id) ?? 0,
    }));

    return { ...page, data };
  });

  // ── POST /api/v1/admin/plugins/register ────────────────────────────────────
  fastify.post(
    '/api/v1/admin/plugins/register',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const input = parseOrThrow(registerPluginSchema, request.body);

      // Single withCoreDb call with Prisma transaction to prevent TOCTOU race
      const result: PluginRecord = await withCoreDb((prisma) =>
        prisma.$transaction(async (tx) => {
          const validation = await validateManifest(tx, input.manifest);
          if (!validation.valid) {
            throw new ValidationError(validation.errors.join('; '));
          }

          return createPlugin(tx, input, request.user.keycloakUserId);
        })
      );

      return {
        id: result.id,
        slug: result.slug,
        name: result.name,
        status: result.status,
        createdAt: result.createdAt,
      };
    }
  );
}
