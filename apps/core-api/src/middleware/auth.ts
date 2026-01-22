import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  extractBearerToken,
  verifyTokenWithTenant,
  extractUserInfo,
  type KeycloakJwtPayload,
  type UserInfo,
} from '../lib/jwt.js';
import { permissionService } from '../services/permission.service.js';
import { tenantService } from '../services/tenant.service.js';
import { MASTER_TENANT_SLUG, USER_ROLES } from '../constants/index.js';

// Extend FastifyRequest to include auth information
declare module 'fastify' {
  interface FastifyRequest {
    user?: UserInfo & { tenantSlug: string };
    token?: KeycloakJwtPayload;
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and extracts user information
 *
 * Routes that require authentication should use this middleware
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Extract token from Authorization header
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    }

    // Verify token and extract tenant
    const payload = await verifyTokenWithTenant(token);

    // Extract user info
    const userInfo = extractUserInfo(payload);

    // Attach to request
    request.user = {
      ...userInfo,
      tenantSlug: payload.tenantSlug,
    };
    request.token = payload;
  } catch (error: any) {
    request.log.error({ error }, 'Authentication failed');

    return reply.code(401).send({
      error: 'Unauthorized',
      message: error.message || 'Invalid or expired token',
    });
  }
}

/**
 * Optional authentication middleware
 * Similar to authMiddleware but doesn't fail if no token is provided
 * Useful for routes that work differently for authenticated vs anonymous users
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const token = extractBearerToken(request.headers.authorization);

    if (token) {
      const payload = await verifyTokenWithTenant(token);
      const userInfo = extractUserInfo(payload);

      request.user = {
        ...userInfo,
        tenantSlug: payload.tenantSlug,
      };
      request.token = payload;
    }
  } catch (error: any) {
    request.log.warn({ error }, 'Optional auth failed, continuing without auth');
  }
}

/**
 * Role-based access control middleware
 * Requires authentication and checks for specific roles
 *
 * Usage:
 * fastify.get('/admin', { preHandler: [authMiddleware, requireRole('admin')] }, handler)
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const userRoles = request.user.roles || [];
    const hasRequiredRole = roles.some((role) => userRoles.includes(role));

    if (!hasRequiredRole) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Required role(s): ${roles.join(', ')}`,
      });
    }
  };
}

/**
 * Permission-based access control middleware
 * Checks if user has specific permissions
 *
 * Permissions should be stored in the tenant's database
 * This middleware fetches and caches them
 *
 * Usage:
 * fastify.get('/posts', { preHandler: [authMiddleware, requirePermission('posts.read')] }, handler)
 */
export function requirePermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    try {
      // Fetch user permissions from database
      const userPermissions = await getUserPermissions(request.user.id, request.user.tenantSlug);

      const hasRequiredPermission = permissions.some((permission) =>
        userPermissions.includes(permission)
      );

      if (!hasRequiredPermission) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: `Required permission(s): ${permissions.join(', ')}`,
        });
      }
    } catch (error: any) {
      request.log.error({ error }, 'Permission check failed');
      return reply.code(500).send({
        error: 'Permission System Error',
        message: 'Failed to check permissions',
      });
    }
  };
}

/**
 * Fetch user permissions from database
 */
async function getUserPermissions(userId: string, tenantSlug: string): Promise<string[]> {
  const schemaName = tenantService.getSchemaName(tenantSlug);
  return await permissionService.getUserPermissions(userId, schemaName);
}

/**
 * Super admin middleware
 * Only allows access to super admins (from master realm)
 */
export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  // Super admins should be from master realm
  if (request.user.tenantSlug !== MASTER_TENANT_SLUG) {
    request.log.warn(
      { userId: request.user.id, tenantSlug: request.user.tenantSlug },
      'Unauthorized super admin access attempt from non-master tenant'
    );
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Super admin access required',
    });
  }

  // Check for super_admin role
  if (!request.user.roles.includes(USER_ROLES.SUPER_ADMIN)) {
    request.log.warn(
      { userId: request.user.id, userRoles: request.user.roles },
      'Unauthorized super admin access attempt - missing super_admin role'
    );
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Super admin access required',
    });
  }
}

/**
 * Tenant owner middleware
 * Only allows access to tenant owners or super admins
 */
export async function requireTenantOwner(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  // Super admins can access any tenant
  if (
    request.user.tenantSlug === MASTER_TENANT_SLUG &&
    request.user.roles.includes(USER_ROLES.SUPER_ADMIN)
  ) {
    return;
  }

  // Check for tenant_owner role
  if (
    !request.user.roles.includes(USER_ROLES.TENANT_OWNER) &&
    !request.user.roles.includes(USER_ROLES.ADMIN)
  ) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Tenant owner or admin access required',
    });
  }
}
