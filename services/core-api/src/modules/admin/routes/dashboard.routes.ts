// dashboard.routes.ts
// GET /api/v1/admin/dashboard/metrics — platform-wide aggregate metrics for
// the super-admin dashboard (Spec 005, Feature 005-01 / S5-B00).
//
// Mounted under the /api/v1/admin prefix by modules/admin/index.ts, so the
// route path here is RELATIVE (/dashboard/metrics). requireSuperAdmin is
// applied BOTH at the admin scope and here per route (defense in depth,
// matches tenant-list.routes.ts / kafka-status.routes.ts pattern).

import { withCoreDb } from '../../../lib/tenant-database.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { DashboardMetricsSchema } from '../schemas/dashboard-schemas.js';
import { getDashboardMetrics } from '../services/dashboard.service.js';

import type { FastifyInstance } from 'fastify';

export async function dashboardRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // ── GET /api/v1/admin/dashboard/metrics ────────────────────────────────────
  fastify.get(
    '/dashboard/metrics',
    { preHandler: [requireSuperAdmin] },
    async () => {
      const result = await withCoreDb((prisma) =>
        getDashboardMetrics(prisma)
      );
      // Validate the outgoing payload — guarantees the response shape is
      // always well-formed and strips any unexpected fields.
      return DashboardMetricsSchema.parse(result);
    }
  );
}
