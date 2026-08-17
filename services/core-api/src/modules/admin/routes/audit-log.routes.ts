// routes/audit-log.routes.ts
// GET /api/v1/admin/audit-logs — paginated platform audit log (S5-302).
//
// Mounted under the /api/v1/admin prefix by modules/admin/index.ts, so the
// route path here is RELATIVE (/audit-logs). requireSuperAdmin is applied
// BOTH at the admin scope and here per route (defense in depth, matches
// tenant-list.routes.ts pattern).

import { withCoreDb } from '../../../lib/tenant-database.js';
import { parseOrThrow, stripUndefined } from '../../../lib/validation.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { AuditQuerySchema } from '../schemas/audit-schemas.js';
import { queryAuditLog } from '../services/audit-log.service.js';

import type { FastifyInstance } from 'fastify';

export async function auditLogRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/admin/audit-logs ───────────────────────────────────────────
  fastify.get('/audit-logs', { preHandler: [requireSuperAdmin] }, async (request) => {
    const { action, tenantId, actorId, page, pageSize } = parseOrThrow(
      AuditQuerySchema,
      request.query
    );

    // stripUndefined drops undefined keys (exactOptionalPropertyTypes).
    const options: Parameters<typeof queryAuditLog>[1] = stripUndefined({
      page,
      pageSize,
      action,
      tenantId,
      actorId,
    });

    return withCoreDb((prisma) => queryAuditLog(prisma, options));
  });
}
