// apps/core-api/src/routes/authorization.ts
//
// RBAC management API — 9 endpoints for roles, permissions, and user role assignment.
// Spec 003 Tasks 2.7, FR-003–FR-006, FR-016, FR-024, NFR-004, NFR-010
//
// Constitution Compliance:
//   - Article 1.2: Tenant isolation — all queries scoped via tenantId from middleware
//   - Article 3.4: REST naming conventions (/api/v1/roles, /api/v1/permissions)
//   - Article 5.1: requirePermission() for all protected endpoints
//   - Article 6.2: Standard { error: { code, message, details? } } error format
//   - NFR-004: 403 MUST NOT expose permission names (delegated to requirePermission)
//   - NFR-010: Write endpoints protected by authzRateLimiter

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { tenantContextMiddleware } from '../middleware/tenant-context.js';
import { tenantService } from '../services/tenant.service.js';
import {
  roleService,
  RoleNameConflictError,
  SystemRoleImmutableError,
  CustomRoleLimitError,
  RoleNotFoundError,
} from '../modules/authorization/role.service.js';
import { permissionRegistrationService } from '../modules/authorization/permission-registration.service.js';
import { authorizationService } from '../modules/authorization/authorization.service.js';
import { authzRateLimiter } from '../modules/authorization/guards/rate-limiter.guard.js';
import { CreateRoleSchema } from '../modules/authorization/dto/create-role.dto.js';
import { UpdateRoleSchema } from '../modules/authorization/dto/update-role.dto.js';
import { AssignRoleSchema } from '../modules/authorization/dto/assign-role.dto.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve tenantId + schemaName from request context (set by tenantContextMiddleware) */
function resolveTenantContext(request: FastifyRequest): { tenantId: string; schemaName: string } {
  const tenant = (request as any).tenant as { tenantId: string; tenantSlug: string } | undefined;
  if (!tenant?.tenantId || !tenant?.tenantSlug) {
    throw new Error('Tenant context not available on request');
  }
  return {
    tenantId: tenant.tenantId,
    schemaName: tenantService.getSchemaName(tenant.tenantSlug),
  };
}

/** Map service errors to HTTP status codes */
function mapServiceError(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
  details?: object;
} {
  if (error instanceof SystemRoleImmutableError) {
    return { statusCode: 403, code: error.code, message: error.message };
  }
  if (error instanceof CustomRoleLimitError) {
    return { statusCode: 422, code: error.code, message: error.message };
  }
  if (error instanceof RoleNameConflictError) {
    return { statusCode: 409, code: error.code, message: error.message };
  }
  if (error instanceof RoleNotFoundError) {
    return { statusCode: 404, code: error.code, message: error.message };
  }
  // Unknown error — log and return generic 500
  logger.error({ error }, 'Unexpected error in authorization route');
  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function authorizationRoutes(fastify: FastifyInstance): Promise<void> {
  // Common preHandler chain for authenticated + tenant-scoped endpoints
  const authChain = [authMiddleware, tenantContextMiddleware];
  const authWriteChain = [authMiddleware, tenantContextMiddleware, authzRateLimiter];

  // -------------------------------------------------------------------------
  // GET /api/v1/roles — list roles (paginated)
  // FR-003, FR-005, plan §3.1
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/roles',
    {
      preHandler: [...authChain, requirePermission('roles:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const query = request.query as Record<string, string>;

        const filters = {
          search: query.search,
          isSystem:
            query.isSystem === 'true' ? true : query.isSystem === 'false' ? false : undefined,
          page: query.page ? parseInt(query.page, 10) : 1,
          limit: query.limit ? Math.min(parseInt(query.limit, 10), 100) : 50,
        };

        const result = await roleService.listRoles(tenantId, schemaName, filters);
        return reply.code(200).send(result);
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply
          .code(mapped.statusCode)
          .send({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
      }
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/roles — create custom role
  // FR-003, FR-005, NFR-009, plan §3.2
  // -------------------------------------------------------------------------
  fastify.post(
    '/v1/roles',
    {
      preHandler: [...authWriteChain, requirePermission('roles:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const parseResult = CreateRoleSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              details: parseResult.error.flatten(),
            },
          });
        }

        const role = await roleService.createRole(tenantId, schemaName, parseResult.data);
        return reply.code(201).send(role);
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply
          .code(mapped.statusCode)
          .send({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
      }
    }
  );

  // -------------------------------------------------------------------------
  // PUT /api/v1/roles/:id — update custom role
  // FR-003, FR-004, FR-005, plan §3.4
  // -------------------------------------------------------------------------
  fastify.put<{ Params: { id: string } }>(
    '/v1/roles/:id',
    {
      preHandler: [...authWriteChain, requirePermission('roles:write')],
    },
    async (request, reply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const { id: roleId } = request.params;

        const parseResult = UpdateRoleSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              details: parseResult.error.flatten(),
            },
          });
        }

        const role = await roleService.updateRole(tenantId, schemaName, roleId, parseResult.data);
        return reply.code(200).send(role);
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply
          .code(mapped.statusCode)
          .send({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
      }
    }
  );

  // -------------------------------------------------------------------------
  // DELETE /api/v1/roles/:id — delete custom role
  // FR-003, FR-004, plan §3.5
  // -------------------------------------------------------------------------
  fastify.delete<{ Params: { id: string } }>(
    '/v1/roles/:id',
    {
      preHandler: [...authWriteChain, requirePermission('roles:write')],
    },
    async (request, reply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const { id: roleId } = request.params;

        await roleService.deleteRole(tenantId, schemaName, roleId);
        return reply.code(204).send();
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply
          .code(mapped.statusCode)
          .send({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
      }
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/permissions — list all permissions (core + plugin)
  // FR-011, plan §3.6
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/permissions',
    {
      preHandler: [...authChain, requirePermission('roles:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const permissions = await permissionRegistrationService.listPermissions(
          tenantId,
          schemaName
        );

        // Group by source: null plugin_id = 'core', otherwise plugin name
        const groups: Record<string, typeof permissions> = {};
        for (const perm of permissions) {
          const groupKey = perm.pluginId ?? 'core';
          if (!groups[groupKey]) groups[groupKey] = [];
          groups[groupKey].push(perm);
        }

        return reply.code(200).send({ data: permissions, groups });
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply
          .code(mapped.statusCode)
          .send({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
      }
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/users/:id/roles — assign role to user
  // FR-006, FR-018, plan §3.7
  // -------------------------------------------------------------------------
  fastify.post<{ Params: { id: string } }>(
    '/v1/users/:id/roles',
    {
      preHandler: [...authWriteChain, requirePermission('users:write')],
    },
    async (request, reply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const { id: userId } = request.params;

        const parseResult = AssignRoleSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              details: parseResult.error.flatten(),
            },
          });
        }

        await roleService.assignRoleToUser(tenantId, schemaName, userId, parseResult.data.roleId);
        return reply.code(200).send({ message: 'Role assigned successfully' });
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply
          .code(mapped.statusCode)
          .send({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
      }
    }
  );

  // -------------------------------------------------------------------------
  // DELETE /api/v1/users/:id/roles/:roleId — remove role from user
  // FR-006, FR-018, plan §3.8
  // -------------------------------------------------------------------------
  fastify.delete<{ Params: { id: string; roleId: string } }>(
    '/v1/users/:id/roles/:roleId',
    {
      preHandler: [...authWriteChain, requirePermission('users:write')],
    },
    async (request, reply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const { id: userId, roleId } = request.params;

        await roleService.removeRoleFromUser(tenantId, schemaName, userId, roleId);
        return reply.code(204).send();
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply
          .code(mapped.statusCode)
          .send({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
      }
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/me/roles — get current user's roles (no permission check, FR-024)
  // FR-024, plan §3.9
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/me/roles',
    {
      preHandler: authChain,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const userId = request.user!.id;

        const roles = await roleService.getUserRoles(tenantId, schemaName, userId);
        return reply.code(200).send({ data: roles });
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply
          .code(mapped.statusCode)
          .send({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
      }
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/me/permissions — get current user's effective permissions
  // FR-024, plan §3.9
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/me/permissions',
    {
      preHandler: authChain,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const userId = request.user!.id;

        const result = await authorizationService.getUserEffectivePermissions(
          userId,
          tenantId,
          schemaName
        );
        return reply.code(200).send(result);
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply
          .code(mapped.statusCode)
          .send({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
      }
    }
  );
}
