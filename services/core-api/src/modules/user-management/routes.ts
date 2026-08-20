// routes.ts
// Fastify plugin — registers all user-management routes.
// All routes require authentication and a valid tenant context.
// Tenant-admin-only routes perform an explicit role check.
//
// NOTE: authMiddleware, tenantContextMiddleware, and userProfileResolver are
// registered as scope-level addHook('preHandler', ...) in index.ts and run
// automatically for every route in this plugin. Do NOT re-add them here.

import { withTenantDb } from '../../lib/tenant-database.js';
import { ForbiddenError, ValidationError } from '../../lib/app-error.js';
import { parseOrThrow, stripUndefined } from '../../lib/validation.js';

import { userListQuerySchema, removeUserSchema, userIdParamSchema } from './schema.js';
import {
  listTenantUsers,
  getUserWorkspaces,
  removeUser,
  listRoles,
  getActionMatrix,
} from './service.js';

import type { UserListFilters } from './types.js';
import type { FastifyInstance } from 'fastify';

function requireTenantAdmin(roles: string[]): void {
  if (!roles.includes('tenant_admin')) {
    throw new ForbiddenError('Tenant admin role required');
  }
}

export async function userManagementRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/users — paginated tenant user list (tenant_admin only)
  fastify.get('/api/v1/users', {}, async (req) => {
    requireTenantAdmin(req.user.roles);

    const query = parseOrThrow(userListQuerySchema, req.query);

    // stripUndefined drops undefined-valued keys to satisfy exactOptionalPropertyTypes.
    const filters: UserListFilters = stripUndefined({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      search: query.search,
    });

    return withTenantDb((db) => listTenantUsers(db, filters, req.tenantContext), req.tenantContext);
  });

  // DELETE /api/v1/users/:id — remove user from tenant (tenant_admin only)
  fastify.delete('/api/v1/users/:id', {}, async (req, reply) => {
    requireTenantAdmin(req.user.roles);

    const { id } = parseOrThrow(userIdParamSchema, req.params);

    // A tenant_admin must never be able to remove their own account: doing so
    // disables their Keycloak account and terminates their sessions, and if
    // they are the tenant's only admin, nobody can administer the tenant
    // afterwards (no in-app path re-enables a Keycloak user). This check is
    // unconditional — it applies even when other admins exist — because
    // self-service admin removal has no legitimate use case here (there is no
    // "transfer ownership" flow this endpoint could safely perform first).
    if (id === req.user.id) {
      throw new ValidationError('Cannot remove your own account');
    }

    // A DELETE carries no body in the common case: the web client calls
    // apiClient.delete(path) with neither payload nor Content-Type, so Fastify
    // leaves req.body undefined. Zod object schemas reject undefined outright,
    // so parsing it directly returned 400 for every UI-driven removal while the
    // integration test — which injects an explicit JSON body — stayed green.
    // Normalising to {} lets reassignments fall back to its declared default.
    const input = parseOrThrow(removeUserSchema, req.body ?? {});

    await removeUser(id, req.user.id, input, req.tenantContext);

    return reply.status(204).send();
  });

  // GET /api/v1/users/:id/workspaces — workspace memberships for a user (tenant_admin only)
  fastify.get('/api/v1/users/:id/workspaces', {}, async (req) => {
    requireTenantAdmin(req.user.roles);

    const { id } = parseOrThrow(userIdParamSchema, req.params);

    return withTenantDb((db) => getUserWorkspaces(db, id, req.tenantContext), req.tenantContext);
  });

  // GET /api/v1/roles — list all roles with metadata (any authenticated tenant user)
  fastify.get('/api/v1/roles', {}, async () => {
    return listRoles();
  });

  // GET /api/v1/roles/action-matrix — full ABAC action matrix (any authenticated tenant user)
  fastify.get('/api/v1/roles/action-matrix', {}, async () => {
    return getActionMatrix();
  });
}
