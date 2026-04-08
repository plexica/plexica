// routes.ts
// Workspace module Fastify plugin — registers all workspace and template routes.
// Template routes are registered BEFORE /:id routes to avoid param shadowing.


import { authMiddleware } from '../../middleware/auth-middleware.js';
import { tenantContextMiddleware } from '../../middleware/tenant-context.js';
import { requireAbac } from '../../middleware/abac.js';
import { redis } from '../../lib/redis.js';
import { ValidationError } from '../../lib/app-error.js';
import { withTenantDb } from '../../lib/tenant-database.js';

import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  reparentSchema,
  workspaceListQuerySchema,
  createTemplateSchema,
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
import { findTemplates, findTemplateById, createTemplate } from './repository-templates.js';

import type { FastifyInstance } from 'fastify';

const pre = [authMiddleware, tenantContextMiddleware];

export async function workspaceRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Template routes (MUST come before /:id) ──────────────────────────────
  fastify.get(
    '/api/v1/workspaces/templates',
    { preHandler: [...pre, requireAbac('workspace:read')] },
    async (req) => {
      return withTenantDb((tx) => findTemplates(tx), req.tenantContext);
    }
  );

  fastify.post(
    '/api/v1/workspaces/templates',
    { preHandler: [...pre, requireAbac('workspace:create')] },
    async (req, reply) => {
      const parsed = createTemplateSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      const { name, description, structure } = parsed.data;
      const result = await withTenantDb(
        (tx) =>
          createTemplate(tx, {
            name,
            description: description ?? null,
            structure,
            createdBy: req.user.id,
          }),
        req.tenantContext
      );
      return reply.status(201).send(result);
    }
  );

  fastify.get(
    '/api/v1/workspaces/templates/:templateId',
    { preHandler: [...pre, requireAbac('workspace:read')] },
    async (req) => {
      const { templateId } = req.params as { templateId: string };
      return withTenantDb((tx) => findTemplateById(tx, templateId), req.tenantContext);
    }
  );

  // ── Workspace list & create ───────────────────────────────────────────────
  fastify.get(
    '/api/v1/workspaces',
    { preHandler: [...pre, requireAbac('workspace:read')] },
    async (req) => {
      const parsed = workspaceListQuerySchema.safeParse(req.query);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      const isTenantAdmin = req.user.roles.includes('tenant_admin');
      const { page, limit, sort, order, status, search } = parsed.data;
      const listFilters: Parameters<typeof listWorkspaces>[3] = { page, limit, sort, order };
      if (status !== undefined) listFilters.status = status;
      if (search !== undefined) listFilters.search = search;
      return withTenantDb(
        (tx) => listWorkspaces(tx, req.user.id, isTenantAdmin, listFilters),
        req.tenantContext
      );
    }
  );

  fastify.post(
    '/api/v1/workspaces',
    { preHandler: [...pre, requireAbac('workspace:create')] },
    async (req, reply) => {
      const parsed = createWorkspaceSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      const result = await withTenantDb(
        (tx) => createWorkspaceService(tx, req.user.id, parsed.data),
        req.tenantContext
      );
      return reply.status(201).send(result);
    }
  );

  // ── Single workspace ──────────────────────────────────────────────────────
  fastify.get(
    '/api/v1/workspaces/:id',
    { preHandler: [...pre, requireAbac('workspace:read')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return withTenantDb((tx) => getWorkspaceService(tx, id, req.user.id), req.tenantContext);
    }
  );

  fastify.patch(
    '/api/v1/workspaces/:id',
    { preHandler: [...pre, requireAbac('workspace:update')] },
    async (req) => {
      const { id } = req.params as { id: string };
      const parsed = updateWorkspaceSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      const ifMatch =
        req.headers['if-match'] !== undefined ? Number(req.headers['if-match']) : undefined;
      return withTenantDb(
        (tx) => updateWorkspaceService(tx, id, req.user.id, parsed.data, ifMatch),
        req.tenantContext
      );
    }
  );

  fastify.delete(
    '/api/v1/workspaces/:id',
    { preHandler: [...pre, requireAbac('workspace:delete')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await withTenantDb(
        (tx) => archiveWorkspaceService(tx, id, req.user.id, req.tenantContext.slug, redis),
        req.tenantContext
      );
      return reply.status(204).send();
    }
  );

  // ── Workspace actions ─────────────────────────────────────────────────────
  fastify.post(
    '/api/v1/workspaces/:id/restore',
    { preHandler: [...pre, requireAbac('workspace:restore')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return withTenantDb(
        (tx) => restoreWorkspaceService(tx, id, req.user.id, req.tenantContext.slug, redis),
        req.tenantContext
      );
    }
  );

  fastify.post(
    '/api/v1/workspaces/:id/reparent',
    { preHandler: [...pre, requireAbac('workspace:reparent')] },
    async (req) => {
      const { id } = req.params as { id: string };
      const parsed = reparentSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      return withTenantDb(
        (tx) =>
          reparentWorkspaceService(
            tx,
            id,
            parsed.data.newParentId,
            req.user.id,
            req.tenantContext.slug,
            redis
          ),
        req.tenantContext
      );
    }
  );

  fastify.get(
    '/api/v1/workspaces/:id/hierarchy',
    { preHandler: [...pre, requireAbac('workspace:read')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return withTenantDb((tx) => getWorkspaceService(tx, id, req.user.id), req.tenantContext);
    }
  );
}
