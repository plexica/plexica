// routes/admin-catalog.routes.ts
// Super admin catalog: list + register plugins.

import { z } from 'zod';
import { withCoreDb } from '../../../lib/tenant-database.js';
import { ValidationError } from '../../../lib/app-error.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { registerPluginSchema } from '../schema/api.js';
import { createPlugin, listPlugins, findPluginBySlug } from '../services/registry.service.js';
import { validateManifest } from '../services/manifest-validator.service.js';

import type { PrismaClient } from '@prisma/client';
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
  fastify.get(
    '/api/v1/admin/plugins',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const options: PluginListOptions = {};
      if (parsed.data.search !== undefined) options.search = parsed.data.search;
      if (parsed.data.status !== undefined) options.status = parsed.data.status;
      if (parsed.data.category !== undefined) options.category = parsed.data.category;
      options.page = parsed.data.page;
      options.pageSize = parsed.data.pageSize;

      return withCoreDb((prisma) => listPlugins(prisma, options));
    }
  );

  // ── POST /api/v1/admin/plugins/register ────────────────────────────────────
  fastify.post(
    '/api/v1/admin/plugins/register',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const parsed = registerPluginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const input = parsed.data;

      // Single withCoreDb call with Prisma transaction to prevent TOCTOU race
      const result: PluginRecord = await withCoreDb((prisma) =>
        prisma.$transaction(async (tx: PrismaClient) => {
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
