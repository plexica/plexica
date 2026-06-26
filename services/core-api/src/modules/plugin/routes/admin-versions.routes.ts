// routes/admin-versions.routes.ts
// Super admin plugin version history routes.

import { withCoreDb } from '../../../lib/tenant-database.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { findPluginBySlug, listPluginVersions } from '../services/registry.service.js';
import { PluginNotFoundError } from '../errors.js';

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

export async function adminVersionsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/admin/plugins/:slug/versions ───────────────────────────────
  fastify.get(
    '/api/v1/admin/plugins/:slug/versions',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const { slug } = request.params as { slug: string };

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
