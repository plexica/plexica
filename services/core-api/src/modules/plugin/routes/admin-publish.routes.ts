// routes/admin-publish.routes.ts
// Super admin publish/unpublish plugin endpoints.

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import {
  findPluginBySlug,
  updatePluginStatus,
} from '../services/registry.service.js';
import { PluginNotFoundError, PluginValidationError } from '../errors.js';

import type { FastifyInstance } from 'fastify';

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
const slugParamSchema = z.object({ slug: z.string().regex(SLUG_REGEX) });

export async function adminPublishRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/v1/admin/plugins/:slug/publish ───────────────────────────────
  fastify.post(
    '/api/v1/admin/plugins/:slug/publish',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params);

      return withCoreDb((prisma) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).$transaction(async (tx: any) => {
          const plugin = await findPluginBySlug(tx, slug);
          if (!plugin) throw new PluginNotFoundError(slug);
          if (plugin.status === 'published') {
            throw new PluginValidationError(`Plugin "${slug}" is already published`);
          }

          const updated = await updatePluginStatus(tx, slug, 'published');
          return { id: updated.id, slug: updated.slug, status: updated.status };
        })
      );
    }
  );

  // ── POST /api/v1/admin/plugins/:slug/unpublish ─────────────────────────────
  fastify.post(
    '/api/v1/admin/plugins/:slug/unpublish',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params);

      return withCoreDb((prisma) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).$transaction(async (tx: any) => {
          const plugin = await findPluginBySlug(tx, slug);
          if (!plugin) throw new PluginNotFoundError(slug);
          if (plugin.status !== 'published') {
            throw new PluginValidationError(`Plugin "${slug}" is not published`);
          }

          const updated = await updatePluginStatus(tx, slug, 'unpublished');
          return { id: updated.id, slug: updated.slug, status: updated.status };
        })
      );
    }
  );
}
