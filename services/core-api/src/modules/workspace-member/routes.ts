// routes.ts
// Fastify plugin — workspace member routes.
// Implements: WS-003 (Workspace Member Management)
//
// NOTE: authMiddleware, tenantContextMiddleware, and userProfileResolver are
// registered as scope-level addHook('preHandler', ...) in index.ts and run
// automatically for every route in this plugin. Do NOT re-add them here.

import { requireAbac } from '../../middleware/abac.js';
import { parseOrThrow, stripUndefined } from '../../lib/validation.js';
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
      const query = parseOrThrow(memberListQuerySchema, req.query);
      // exactOptionalPropertyTypes: stripUndefined drops undefined-valued keys.
      const filters: MemberListFilters = stripUndefined({
        page: query.page,
        limit: query.limit,
        search: query.search,
      });
      return withTenantDb((db) => listMembers(db, id, filters), req.tenantContext);
    }
  );

  // POST /api/v1/workspaces/:id/members
  fastify.post(
    '/api/v1/workspaces/:id/members',
    { preHandler: [requireAbac('member:invite')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = parseOrThrow(addMemberSchema, req.body);
      const member = await withTenantDb(
        (db) => addMember(db, id, input.userId, input.role, req.user.id, req.tenantContext.slug),
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
        (db) => removeMember(db, id, userId, req.user.id, req.tenantContext.slug),
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
      const { role } = parseOrThrow(changeMemberRoleSchema, req.body);
      return withTenantDb(
        (db) => changeMemberRole(db, id, userId, role, req.user.id, req.tenantContext.slug),
        req.tenantContext
      );
    }
  );
}
