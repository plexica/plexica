// routes.ts
// Fastify plugin — workspace member routes.
// Implements: WS-003 (Workspace Member Management)
//
// NOTE: authMiddleware, tenantContextMiddleware, and userProfileResolver are
// registered as scope-level addHook('preHandler', ...) in index.ts and run
// automatically for every route in this plugin. Do NOT re-add them here.

import { requireAbac } from '../../middleware/abac.js';
import { ValidationError } from '../../lib/app-error.js';
import { withTenantDb } from '../../lib/tenant-database.js';

import { addMemberSchema, changeMemberRoleSchema, memberListQuerySchema } from './schema.js';
import { listMembers, addMember, removeMember, changeMemberRole } from './service.js';

import type { FastifyInstance } from 'fastify';
import type { MemberListFilters } from './types.js';

export async function workspaceMemberRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/workspaces/:id/members
  fastify.get(
    '/api/v1/workspaces/:id/members',
    { preHandler: [requireAbac('member:list')] },
    async (req) => {
      const { id } = req.params as { id: string };
      const parsed = memberListQuerySchema.safeParse(req.query);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      // exactOptionalPropertyTypes: build the filters object without undefined values
      const filters: MemberListFilters = { page: parsed.data.page, limit: parsed.data.limit };
      if (parsed.data.search !== undefined) filters.search = parsed.data.search;
      return withTenantDb((tx) => listMembers(tx, id, filters), req.tenantContext);
    }
  );

  // POST /api/v1/workspaces/:id/members
  fastify.post(
    '/api/v1/workspaces/:id/members',
    { preHandler: [requireAbac('member:invite')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      const member = await withTenantDb(
        (tx) =>
          addMember(
            tx,
            id,
            parsed.data.userId,
            parsed.data.role,
            req.user.id,
            req.tenantContext.slug
          ),
        req.tenantContext
      );
      return reply.status(201).send(member);
    }
  );

  // DELETE /api/v1/workspaces/:id/members/:userId
  fastify.delete(
    '/api/v1/workspaces/:id/members/:userId',
    { preHandler: [requireAbac('member:remove')] },
    async (req, reply) => {
      const { id, userId } = req.params as { id: string; userId: string };
      await withTenantDb(
        (tx) => removeMember(tx, id, userId, req.user.id, req.tenantContext.slug),
        req.tenantContext
      );
      return reply.status(204).send();
    }
  );

  // PATCH /api/v1/workspaces/:id/members/:userId
  fastify.patch(
    '/api/v1/workspaces/:id/members/:userId',
    { preHandler: [requireAbac('member:role-change')] },
    async (req) => {
      const { id, userId } = req.params as { id: string; userId: string };
      const parsed = changeMemberRoleSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      return withTenantDb(
        (tx) =>
          changeMemberRole(tx, id, userId, parsed.data.role, req.user.id, req.tenantContext.slug),
        req.tenantContext
      );
    }
  );
}
