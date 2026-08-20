// routes/tenant-list.routes.ts
// GET /api/v1/admin/tenants — paginated, searchable tenant list (S5-201).
//
// requireSuperAdmin is applied BOTH:
//   - at the admin scope in modules/admin/index.ts (group-level)
//   - here per route (defense in depth, matches admin-catalog pattern)

import { withCoreDb } from '../../../lib/tenant-database.js';
import { parseOrThrow, stripUndefined } from '../../../lib/validation.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { TenantListQuerySchema } from '../schemas/tenant-schemas.js';
import { listTenants } from '../services/tenant-list.service.js';

import type { FastifyInstance } from 'fastify';

export async function tenantListRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/tenants', { preHandler: [requireSuperAdmin] }, async (request) => {
    const { search, status, page, pageSize } = parseOrThrow(TenantListQuerySchema, request.query);

    // stripUndefined drops undefined keys (exactOptionalPropertyTypes).
    const options: Parameters<typeof listTenants>[1] = stripUndefined({
      page,
      pageSize,
      search,
      status,
    });

    return withCoreDb((prisma) => listTenants(prisma, options));
  });
}
