// routes/admin-publish.routes.ts
// Super admin publish/unpublish plugin endpoints.
//
// S5-801 — publish requires reviewStatus === 'approved' (ADR-022 Decision 5);
// unpublish transitions to 'deprecated' when installations exist (still works
// for existing installs) or 'unpublished' when none exist. Both write a
// platform audit log entry (ADR-022 Decision 2).

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { writeAuditEntry } from '../../admin/services/audit-log.service.js';
import { updatePluginStatus } from '../services/registry.service.js';
import { countPluginInstallations } from '../services/plugin-install-count.service.js';
import {
  PluginNotFoundError,
  PluginValidationError,
  PluginReviewRequiredError,
} from '../errors.js';

import type { FastifyInstance } from 'fastify';

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
const slugParamSchema = z.object({ slug: z.string().regex(SLUG_REGEX) });

type PluginStateRow = {
  id: string;
  slug: string;
  status: string;
  reviewStatus: string | null;
  version: string;
};

export async function adminPublishRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/v1/admin/plugins/:slug/publish ───────────────────────────────
  fastify.post(
    '/api/v1/admin/plugins/:slug/publish',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params);
      const actorId = request.user.keycloakUserId;

      return withCoreDb(async (prisma) => {
        const plugin = await prisma.plugin.findUnique({
          where: { slug },
          select: { id: true, slug: true, status: true, reviewStatus: true, version: true },
        }) as PluginStateRow | null;
        if (!plugin) throw new PluginNotFoundError(slug);
        if (plugin.status === 'published') {
          throw new PluginValidationError(`Plugin "${slug}" is already published`);
        }
        if (plugin.reviewStatus !== 'approved') {
          throw new PluginReviewRequiredError();
        }

        const updated = await updatePluginStatus(prisma, slug, 'published');
        await writeAuditEntry(prisma, {
          actorId,
          action: 'plugin.publish',
          resourceType: 'plugin',
          resourceId: plugin.id,
          metadata: { slug, version: plugin.version },
          ipAddress: request.ip,
        });
        return { id: updated.id, slug: updated.slug, status: updated.status };
      });
    }
  );

  // ── POST /api/v1/admin/plugins/:slug/unpublish ─────────────────────────────
  fastify.post(
    '/api/v1/admin/plugins/:slug/unpublish',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params);
      const actorId = request.user.keycloakUserId;

      return withCoreDb(async (prisma) => {
        const plugin = await prisma.plugin.findUnique({
          where: { slug },
          select: { id: true, slug: true, status: true },
        }) as { id: string; slug: string; status: string } | null;
        if (!plugin) throw new PluginNotFoundError(slug);
        if (plugin.status !== 'published') {
          throw new PluginValidationError(`Plugin "${slug}" is not published`);
        }

        // ADR-022 Decision 5: deprecated if installs exist (keep working),
        // unpublished if none (fully withdrawn).
        const installedCount = await countPluginInstallations(prisma, plugin.id);
        const newStatus = installedCount > 0 ? 'deprecated' : 'unpublished';
        const updated = await updatePluginStatus(prisma, slug, newStatus);
        await writeAuditEntry(prisma, {
          actorId,
          action: 'plugin.unpublish',
          resourceType: 'plugin',
          resourceId: plugin.id,
          metadata: { slug, previousStatus: plugin.status, newStatus, installedCount },
          ipAddress: request.ip,
        });
        return {
          id: updated.id,
          slug: updated.slug,
          status: updated.status,
          installedCount,
        };
      });
    }
  );
}
