// routes.ts
// Fastify plugin — audit log query routes.
// All routes require auth + tenant context + ABAC check.
// Implements: Spec 003, Phase 10
//
// NOTE: authMiddleware, tenantContextMiddleware, and userProfileResolver are
// registered as scope-level addHook('preHandler', ...) in index.ts and run
// automatically for every route in this plugin. Do NOT re-add them here.

import { requireAbac } from '../../middleware/abac.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { parseOrThrow, stripUndefined } from '../../lib/validation.js';

import { auditLogQuerySchema } from './schema.js';
import { getAuditLog, getActionTypes } from './service.js';

import type { FastifyInstance } from 'fastify';
import type { AuditLogFilters } from './types.js';

export async function auditLogRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/tenant/audit-log ─────────────────────────────────────────
  fastify.get(
    '/api/v1/tenant/audit-log',
    { preHandler: [requireAbac('audit:read')] },
    async (request) => {
      const query = parseOrThrow(auditLogQuerySchema, request.query);

      const filters: AuditLogFilters = stripUndefined({
        page: query.page,
        pageSize: query.pageSize,
        actorId: query.actorId,
        actionType: query.actionType,
        workspaceId: query.workspaceId,
      });
      if (query.fromDate !== undefined) filters.from = new Date(query.fromDate);
      if (query.toDate !== undefined) {
        // Date-only strings (YYYY-MM-DD) resolve to midnight UTC, excluding
        // all events later in that same day. Normalize to end-of-day.
        const raw = query.toDate;
        const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
        filters.to = isDateOnly ? new Date(`${raw}T23:59:59.999Z`) : new Date(raw);
      }

      return withTenantDb((db) => getAuditLog(db, filters), request.tenantContext);
    }
  );

  // ── GET /api/v1/tenant/audit-log/action-types ────────────────────────────
  fastify.get(
    '/api/v1/tenant/audit-log/action-types',
    { preHandler: [requireAbac('audit:read')] },
    async () => {
      return getActionTypes();
    }
  );
}
