// routes-templates.ts
// Workspace template routes. Extracted from routes.ts to satisfy the
// 200-line-per-file rule (Constitution Rule 4).
//
// IMPORTANT: these routes MUST be registered before the /api/v1/workspaces/:id
// routes, otherwise `:id` shadows the literal `templates` segment. The caller
// (workspaceRoutes) invokes this function directly on the same Fastify
// instance, so registration order is preserved.
//
// NOTE: authMiddleware, tenantContextMiddleware and userProfileResolver are
// registered as scope-level preHandler hooks in index.ts — do NOT re-add them.

import { requireAbac } from '../../middleware/abac.js';
import { ValidationError } from '../../lib/app-error.js';
import { withTenantDb } from '../../lib/tenant-database.js';

import { createTemplateSchema } from './schema.js';
import { findTemplates, findTemplateById, createTemplate } from './repository-templates.js';

import type { FastifyInstance } from 'fastify';

export function workspaceTemplateRoutes(fastify: FastifyInstance): void {
  fastify.get(
    '/api/v1/workspaces/templates',
    { preHandler: [requireAbac('workspace:read')] },
    async (req) => {
      return withTenantDb((db) => findTemplates(db), req.tenantContext);
    }
  );

  fastify.post(
    '/api/v1/workspaces/templates',
    { preHandler: [requireAbac('workspace:create')] },
    async (req, reply) => {
      const parsed = createTemplateSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      const { name, description, structure } = parsed.data;
      const result = await withTenantDb(
        (db) =>
          createTemplate(db, {
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
    { preHandler: [requireAbac('workspace:read')] },
    async (req) => {
      const { templateId } = req.params as { templateId: string };
      return withTenantDb((db) => findTemplateById(db, templateId), req.tenantContext);
    }
  );
}
