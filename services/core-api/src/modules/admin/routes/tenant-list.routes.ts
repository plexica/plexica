// routes/tenant-list.routes.ts
// GET /api/v1/admin/tenants — paginated, searchable tenant list (S5-201).
//
// requireSuperAdmin is applied BOTH:
//   - at the admin scope in modules/admin/index.ts (group-level)
//   - here per route (defense in depth, matches admin-catalog pattern)

import { withCoreDb } from '../../../lib/tenant-database.js';
import { ValidationError } from '../../../lib/app-error.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { TenantListQuerySchema } from '../schemas/tenant-schemas.js';
import { listTenants } from '../services/tenant-list.service.js';

import type { FastifyInstance } from 'fastify';

export async function tenantListRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/api/v1/admin/tenants',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const parsed = TenantListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues.map((i) => i.message).join(', ')
        );
      }

      const { search, status, page, pageSize } = parsed.data;

      // Build options without undefined keys (exactOptionalPropertyTypes).
      const options: Parameters<typeof listTenants>[1] = { page, pageSize };
      if (search !== undefined) options.search = search;
      if (status !== undefined) options.status = status;

      return withCoreDb((prisma) => listTenants(prisma, options));
    }
  );
}
