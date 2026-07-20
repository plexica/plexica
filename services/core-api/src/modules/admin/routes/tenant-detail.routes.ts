// routes/tenant-detail.routes.ts
// GET /api/v1/admin/tenants/:id — single-tenant aggregate detail (S5-302).
//
// Mounted under the /api/v1/admin prefix by modules/admin/index.ts, so the
// route path here is RELATIVE (/tenants/:id). requireSuperAdmin is applied
// BOTH at the admin scope and here per route (defense in depth, matches
// tenant-list.routes.ts pattern).

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { ValidationError } from '../../../lib/app-error.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { getTenantDetail } from '../services/tenant-detail.service.js';

import type { FastifyInstance } from 'fastify';

const TenantDetailParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function tenantDetailRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // ── GET /api/v1/admin/tenants/:id ──────────────────────────────────────────
  fastify.get(
    '/tenants/:id',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const parsed = TenantDetailParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues.map((i) => i.message).join(', ')
        );
      }

      const { id } = parsed.data;

      return withCoreDb((prisma) => getTenantDetail(prisma, id));
    }
  );
}
