// routes.ts
// Workspace module Fastify plugin — registers all workspace and template routes.
// Template routes are registered BEFORE /:id routes to avoid param shadowing.
//
// NOTE: authMiddleware, tenantContextMiddleware, and userProfileResolver are
// registered as scope-level addHook('preHandler', ...) in index.ts and run
// automatically for every route in this plugin. Do NOT re-add them here —
// doing so would run authMiddleware twice per request, overwriting the internal
// user_profile.user_id that userProfileResolver sets back to the Keycloak sub.

import { requireAbac } from '../../middleware/abac.js';
import { redis } from '../../lib/redis.js';
import { parseOrThrow, stripUndefined } from '../../lib/validation.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { writeAuditLog } from '../audit-log/writer.js';

import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  reparentSchema,
  workspaceListQuerySchema,
} from './schema.js';
import {
  listWorkspaces,
  createWorkspaceService,
  getWorkspaceService,
  updateWorkspaceService,
} from './service.js';
import {
  archiveWorkspaceService,
  restoreWorkspaceService,
  reparentWorkspaceService,
} from './service-archive.js';
import { workspaceTemplateRoutes } from './routes-templates.js';

import type { FastifyInstance } from 'fastify';

export async function workspaceRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Template routes (MUST be registered before /:id) ─────────────────────
  workspaceTemplateRoutes(fastify);

  // ── Workspace list & create ───────────────────────────────────────────────
  fastify.get(
    '/api/v1/workspaces',
    { preHandler: [requireAbac('workspace:read')] },
    async (req) => {
      const { page, limit, sort, order, status, search } = parseOrThrow(
        workspaceListQuerySchema,
        req.query
      );
      const isTenantAdmin = req.user.roles.includes('tenant_admin');
      const listFilters: Parameters<typeof listWorkspaces>[3] = stripUndefined({
        page,
        limit,
        sort,
        order,
        status,
        search,
      });
      return withTenantDb(
        (db) => listWorkspaces(db, req.user.id, isTenantAdmin, listFilters),
        req.tenantContext
      );
    }
  );

  fastify.post(
    '/api/v1/workspaces',
    { preHandler: [requireAbac('workspace:create')] },
    async (req, reply) => {
      const input = parseOrThrow(createWorkspaceSchema, req.body);
      const result = await withTenantDb(async (db) => {
        const created = await db.$transaction((tx) =>
          createWorkspaceService(tx, req.user.id, input, req.tenantContext.tenantId)
        );
        // Audit is an observational side-effect, deliberately written AFTER the
        // transaction committed and on the non-transactional client: a failed
        // audit INSERT inside the tx would abort it (SQLSTATE 25P02) even
        // though writeAuditLog swallows the rejection. If this write fails the
        // workspace stays created and the request still answers 201.
        await writeAuditLog(db, created.auditEntry);
        return created.workspace;
      }, req.tenantContext);
      return reply.status(201).send(result);
    }
  );

  // ── Single workspace ──────────────────────────────────────────────────────
  fastify.get(
    '/api/v1/workspaces/:id',
    { preHandler: [requireAbac('workspace:read')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return withTenantDb((db) => getWorkspaceService(db, id, req.user.id), req.tenantContext);
    }
  );

  fastify.patch(
    '/api/v1/workspaces/:id',
    { preHandler: [requireAbac('workspace:update')] },
    async (req) => {
      const { id } = req.params as { id: string };
      const input = parseOrThrow(updateWorkspaceSchema, req.body);
      const ifMatch =
        req.headers['if-match'] !== undefined ? Number(req.headers['if-match']) : undefined;
      return withTenantDb(
        (db) => updateWorkspaceService(db, id, req.user.id, input, ifMatch),
        req.tenantContext
      );
    }
  );

  fastify.delete(
    '/api/v1/workspaces/:id',
    { preHandler: [requireAbac('workspace:delete')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await withTenantDb(
        (db) => archiveWorkspaceService(db, id, req.user.id, req.tenantContext.slug, redis),
        req.tenantContext
      );
      return reply.status(204).send();
    }
  );

  // ── Workspace actions ─────────────────────────────────────────────────────
  fastify.post(
    '/api/v1/workspaces/:id/restore',
    { preHandler: [requireAbac('workspace:restore')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return withTenantDb(
        (db) => restoreWorkspaceService(db, id, req.user.id, req.tenantContext.slug, redis),
        req.tenantContext
      );
    }
  );

  fastify.post(
    '/api/v1/workspaces/:id/reparent',
    { preHandler: [requireAbac('workspace:reparent')] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { newParentId } = parseOrThrow(reparentSchema, req.body);
      return withTenantDb(
        (db) =>
          reparentWorkspaceService(db, id, newParentId, req.user.id, req.tenantContext.slug, redis),
        req.tenantContext
      );
    }
  );

  fastify.get(
    '/api/v1/workspaces/:id/hierarchy',
    { preHandler: [requireAbac('workspace:read')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return withTenantDb((db) => getWorkspaceService(db, id, req.user.id), req.tenantContext);
    }
  );
}
