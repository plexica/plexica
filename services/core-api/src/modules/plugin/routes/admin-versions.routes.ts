// routes/admin-versions.routes.ts
// Super admin plugin version history routes.

import { z } from 'zod';
import { withCoreDb } from '../../../lib/tenant-database.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { findPluginBySlug, listPluginVersions } from '../services/registry.service.js';
import { PluginNotFoundError } from '../errors.js';

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
const slugParamSchema = z.object({ slug: z.string().regex(SLUG_REGEX) });

export async function adminVersionsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/admin/plugins/:slug/versions ───────────────────────────────
  fastify.get(
    '/api/v1/admin/plugins/:slug/versions',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params);

      // Single withCoreDb call — N+1 prevention
      return withCoreDb((prisma: PrismaClient) =>
        prisma.$transaction(async (tx: PrismaClient) => {
          const plugin = await findPluginBySlug(tx, slug);
          if (!plugin) throw new PluginNotFoundError(slug);
          return listPluginVersions(tx, plugin.id);
        })
      );
    }
  );
}
