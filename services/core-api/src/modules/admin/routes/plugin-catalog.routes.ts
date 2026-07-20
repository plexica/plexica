// routes/plugin-catalog.routes.ts
// POST /api/v1/admin/plugins/:slug/review — super admin approves/rejects a
// plugin before it can be published (S5-800 / Feature 005-08, ADR-022 D5).
//
// Mounted under the /api/v1/admin prefix by modules/admin/index.ts, so the
// route path here is RELATIVE (/plugins/:slug/review). requireSuperAdmin is
// applied BOTH at the admin scope and here per route (defense in depth,
// matches tenant-list.routes.ts pattern).
//
// Only this review endpoint lives here. publish/unpublish stay in
// modules/plugin/routes/admin-publish.routes.ts.

import { withCoreDb } from '../../../lib/tenant-database.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { writeAuditEntry } from '../services/audit-log.service.js';
import {
  ReviewBodySchema,
  ReviewParamsSchema,
  ReviewResponseSchema,
} from '../schemas/plugin-catalog-schemas.js';
import { PluginNotFoundError } from '../../plugin/errors.js';
import { ValidationError } from '../../../lib/app-error.js';

import type { FastifyInstance } from 'fastify';

export async function pluginCatalogRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // ── POST /api/v1/admin/plugins/:slug/review ───────────────────────────────
  fastify.post(
    '/plugins/:slug/review',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const { slug } = ReviewParamsSchema.parse(request.params);
      const { decision, notes } = ReviewBodySchema.parse(request.body);

      const reviewStatus = decision === 'approve' ? 'approved' : 'rejected';
      const reviewerId = request.user.keycloakUserId;
      const reviewedAt = new Date();

      const response = await withCoreDb(async (prisma) => {
        const plugin = await prisma.plugin.findUnique({ where: { slug } });
        if (!plugin) throw new PluginNotFoundError(slug);

        // ADR-022 D5: review only acts on plugins submitted for review
        if (plugin.reviewStatus !== 'pending') {
          throw new ValidationError(
            `Plugin reviewStatus is '${plugin.reviewStatus}', must be 'pending' to review`
          );
        }

        const updated = await prisma.plugin.update({
          where: { slug },
          data: {
            reviewStatus,
            reviewedAt,
            reviewedBy: reviewerId,
            ...(notes !== undefined ? { reviewNotes: notes } : {}),
          },
          select: {
            id: true,
            slug: true,
            reviewStatus: true,
            reviewedAt: true,
            reviewedBy: true,
          },
        });

        await writeAuditEntry(prisma, {
          actorId: reviewerId,
          action: 'plugin.review',
          resourceType: 'plugin',
          resourceId: plugin.id,
          metadata: { decision, ...(notes !== undefined ? { notes } : {}) },
          ipAddress: request.ip,
        });

        return updated;
      });

      return ReviewResponseSchema.parse(response);
    }
  );
}
