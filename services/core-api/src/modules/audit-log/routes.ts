// routes.ts
// Fastify plugin — audit log query routes.
// All routes require auth + tenant context + ABAC check.
// Implements: Spec 003, Phase 10


import { authMiddleware } from '../../middleware/auth-middleware.js';
import { tenantContextMiddleware } from '../../middleware/tenant-context.js';
import { requireAbac } from '../../middleware/abac.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { ValidationError } from '../../lib/app-error.js';

import { auditLogQuerySchema } from './schema.js';
import { getAuditLog, getActionTypes } from './service.js';

import type { FastifyInstance } from 'fastify';
import type { AuditLogFilters } from './types.js';

const pre = [authMiddleware, tenantContextMiddleware];

export async function auditLogRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/tenant/audit-log ─────────────────────────────────────────
  fastify.get(
    '/api/v1/tenant/audit-log',
    { preHandler: [...pre, requireAbac('audit:read')] },
    async (request) => {
      const parsed = auditLogQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const filters: AuditLogFilters = {
        page: parsed.data.page,
        pageSize: parsed.data.limit,
      };
      if (parsed.data.actorId !== undefined) filters.actorId = parsed.data.actorId;
      if (parsed.data.actionType !== undefined) filters.actionType = parsed.data.actionType;
      if (parsed.data.fromDate !== undefined) filters.from = new Date(parsed.data.fromDate);
      if (parsed.data.toDate !== undefined) filters.to = new Date(parsed.data.toDate);

      return withTenantDb((tx) => getAuditLog(tx, filters), request.tenantContext);
    }
  );

  // ── GET /api/v1/tenant/audit-log/action-types ────────────────────────────
  fastify.get(
    '/api/v1/tenant/audit-log/action-types',
    { preHandler: [...pre, requireAbac('audit:read')] },
    async () => {
      return getActionTypes();
    }
  );
}
