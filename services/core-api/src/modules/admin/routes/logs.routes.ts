// routes/logs.routes.ts
// GET /api/v1/admin/logs — aggregated log search via Loki proxy (S5-A02).
//
// Mounted under the /api/v1/admin prefix by modules/admin/index.ts, so the
// route path here is RELATIVE (/logs). requireSuperAdmin is applied BOTH at
// the admin scope and here per route (defense in depth, matches
// tenant-list.routes.ts / audit-log.routes.ts pattern).

import { withCoreDb } from '../../../lib/tenant-database.js';
import { parseOrThrow, stripUndefined } from '../../../lib/validation.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { LogsQuerySchema } from '../schemas/logs-schemas.js';
import { queryLogs } from '../services/logs-query.service.js';

import type { FastifyInstance } from 'fastify';

export async function logsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/admin/logs ───────────────────────────────────────────────
  fastify.get('/logs', { preHandler: [requireSuperAdmin] }, async (request) => {
    const { tenant, level, start, end, limit } = parseOrThrow(LogsQuerySchema, request.query);

    // stripUndefined drops undefined keys (exactOptionalPropertyTypes).
    const options: Parameters<typeof queryLogs>[1] = stripUndefined({
      limit,
      tenant,
      level,
      start,
      end,
    });

    return withCoreDb((prisma) => queryLogs(prisma, options));
  });
}
