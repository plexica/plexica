// routes.ts
// Fastify plugin — registers all user-management routes.
// All routes require authentication and a valid tenant context.
// Tenant-admin-only routes perform an explicit role check.


import { authMiddleware } from '../../middleware/auth-middleware.js';
import { tenantContextMiddleware } from '../../middleware/tenant-context.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { ForbiddenError, ValidationError } from '../../lib/app-error.js';

import { userListQuerySchema, removeUserSchema } from './schema.js';
import {
  listTenantUsers,
  getUserWorkspaces,
  removeUser,
  listRoles,
  getActionMatrix,
} from './service.js';

import type { UserListFilters } from './types.js';
import type { FastifyInstance } from 'fastify';

const pre = [authMiddleware, tenantContextMiddleware];

function requireTenantAdmin(roles: string[]): void {
  if (!roles.includes('tenant_admin')) {
    throw new ForbiddenError('Tenant admin role required');
  }
}

export async function userManagementRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/users — paginated tenant user list (tenant_admin only)
  fastify.get('/api/v1/users', { preHandler: pre }, async (req) => {
    requireTenantAdmin(req.user.roles);

    const parsed = userListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

    // Build filters without optional-undefined properties to satisfy exactOptionalPropertyTypes.
    const filters: UserListFilters = {
      page: parsed.data.page,
      limit: parsed.data.limit,
    };
    if (parsed.data.status !== undefined) filters.status = parsed.data.status;
    if (parsed.data.search !== undefined) filters.search = parsed.data.search;

    return withTenantDb((tx) => listTenantUsers(tx, filters, req.tenantContext), req.tenantContext);
  });

  // DELETE /api/v1/users/:id — remove user from tenant (tenant_admin only)
  fastify.delete('/api/v1/users/:id', { preHandler: pre }, async (req, reply) => {
    requireTenantAdmin(req.user.roles);

    const { id } = req.params as { id: string };

    const parsed = removeUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

    await removeUser(id, req.user.id, parsed.data, req.tenantContext);

    return reply.status(204).send();
  });

  // GET /api/v1/users/:id/workspaces — workspace memberships for a user (tenant_admin only)
  fastify.get('/api/v1/users/:id/workspaces', { preHandler: pre }, async (req) => {
    requireTenantAdmin(req.user.roles);

    const { id } = req.params as { id: string };

    return withTenantDb((tx) => getUserWorkspaces(tx, id, req.tenantContext), req.tenantContext);
  });

  // GET /api/v1/roles — list all roles with metadata (any authenticated tenant user)
  fastify.get('/api/v1/roles', { preHandler: pre }, async () => {
    return listRoles();
  });

  // GET /api/v1/roles/action-matrix — full ABAC action matrix (any authenticated tenant user)
  fastify.get('/api/v1/roles/action-matrix', { preHandler: pre }, async () => {
    return getActionMatrix();
  });
}
