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
 *
 * Constitution Compliance:
 * - Article 5.1: RBAC enforcement with tenant validation
 * - Article 5.1: Tenant context validation on every request
 * - Article 6.2: Constitution-compliant error format
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Extract token from Authorization header
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      return reply.code(401).send({
        error: {
          code: 'AUTH_TOKEN_MISSING',
          message: 'Missing or invalid Authorization header',
        },
      });
    }

    // Verify token and extract tenant
    const payload = await verifyTokenWithTenant(token);

    // Validate tenant exists and is not suspended (FR-012, Edge Case #9)
    let tenant;
    try {
      tenant = await tenantService.getTenantBySlug(payload.tenantSlug);
    } catch (error: any) {
      request.log.warn(
        { tenantSlug: payload.tenantSlug, error: error.message },
        'Tenant not found for authenticated user'
      );
      return reply.code(403).send({
        error: {
          code: 'AUTH_TENANT_NOT_FOUND',
          message: 'The tenant associated with this token does not exist',
          details: {
            tenantSlug: payload.tenantSlug,
          },
        },
      });
    }

    // Reject suspended tenants (FR-012, Edge Case #9)
    if (tenant.status === 'SUSPENDED') {
      request.log.warn(
        { tenantSlug: payload.tenantSlug, tenantId: tenant.id },
        'Authentication denied for suspended tenant'
      );
      return reply.code(403).send({
        error: {
          code: 'AUTH_TENANT_SUSPENDED',
          message: 'This tenant account is currently suspended. Please contact support.',
          details: {
            tenantSlug: payload.tenantSlug,
            status: 'SUSPENDED',
          },
        },
      });
    }

    // Cross-tenant validation (FR-011)
    // SECURITY: Use URL parsing to extract the path without query string.
    // Using request.url.split('/') directly is vulnerable to query string
    // pollution (e.g., /api/v1/foo?x=/tenants/evil-id) and URL encoding bypass.
    const parsedUrl = new URL(request.url, 'http://localhost');
    const pathSegments = parsedUrl.pathname.split('/');
    const tenantIndex = pathSegments.indexOf('tenants');
    if (tenantIndex !== -1 && pathSegments[tenantIndex + 1]) {
      const requestedTenantId = pathSegments[tenantIndex + 1];

      // Skip validation if super admin from master realm
      const isSuperAdmin =
        payload.tenantSlug === MASTER_TENANT_SLUG &&
        (payload.roles?.includes(USER_ROLES.SUPER_ADMIN) || payload.roles?.includes('super-admin'));

      if (!isSuperAdmin) {
        // Validate JWT tenant matches requested tenant
        if (tenant.id !== requestedTenantId) {
          request.log.warn(
            {
              jwtTenant: payload.tenantSlug,
              jwtTenantId: tenant.id,
              requestedTenantId,
              path: request.url,
            },
            '[SECURITY] Cross-tenant access attempt detected in authMiddleware'
          );
          return reply.code(403).send({
            error: {
              code: 'AUTH_CROSS_TENANT',
              message: 'Token not valid for this tenant',
              details: {
                jwtTenant: payload.tenantSlug,
                requestedTenantId,
              },
            },
          });
        }
      }
    }

    // Extract user info
    const userInfo = extractUserInfo(payload);

    // Attach to request
    request.user = {
      ...userInfo,
      tenantSlug: payload.tenantSlug,
    };
    request.token = payload;
  } catch (error: any) {
    request.log.error({ error: error.message }, 'Authentication failed');

    // Determine error type and return appropriate response
    if (error.message && error.message.includes('expired')) {
      return reply.code(401).send({
        error: {
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'Token has expired',
        },
      });
    }

    // SECURITY: Do not include error.message in the response — it can leak
    // internal Keycloak URLs, expected audiences, and algorithm details.
    // The full error is already logged server-side above.
    return reply.code(401).send({
      error: {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid or malformed token',
      },
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
 *
 * Constitution Compliance: Article 6.2 (error format)
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.code(401).send({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
      });
    }

    const userRoles = request.user.roles || [];
    const hasRequiredRole = roles.some((role) => userRoles.includes(role));

    if (!hasRequiredRole) {
      return reply.code(403).send({
        error: {
          code: 'AUTH_INSUFFICIENT_ROLE',
          message: `Required role(s): ${roles.join(', ')}`,
          details: {
            requiredRoles: roles,
            userRoles,
          },
        },
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
 *
 * Constitution Compliance: Article 6.2 (error format)
 */
export function requirePermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.code(401).send({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
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
          error: {
            code: 'AUTH_INSUFFICIENT_PERMISSION',
            message: `Required permission(s): ${permissions.join(', ')}`,
            details: {
              requiredPermissions: permissions,
            },
          },
        });
      }
    } catch (error: any) {
      request.log.error({ error: error.message }, 'Permission check failed');
      return reply.code(500).send({
        error: {
          code: 'PERMISSION_CHECK_FAILED',
          message: 'Failed to verify permissions',
          details: {
            reason: error.message,
          },
        },
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
 * Only allows access to super admins (from master realm or plexica-admin realm)
 *
 * Constitution Compliance: Article 6.2 (error format)
 */
export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // DEVELOPMENT MODE: Bypass authentication if BYPASS_AUTH is enabled
  // SECURITY: Only allow bypass when NODE_ENV is NOT production (covers development, test, etc.)
  if (process.env.BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    request.log.warn('⚠️  BYPASS_AUTH enabled - skipping authentication (DEVELOPMENT ONLY)');

    // Mock a super-admin user
    request.user = {
      id: 'dev-super-admin',
      username: 'dev-admin',
      name: 'Development Super Admin',
      email: 'dev@plexica.local',
      roles: ['super-admin', 'super_admin'],
      tenantSlug: 'plexica-admin',
    };

    return;
  }

  // Run authMiddleware first if not already run
  if (!request.user) {
    await authMiddleware(request, reply);
    if (reply.sent) return; // authMiddleware failed
  }

  // Double-check authentication after middleware
  if (!request.user) {
    return reply.code(401).send({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
    });
  }

  // Super admins should be from master realm or plexica-admin realm.
  // plexica-test is only valid in non-production environments (for tests).
  const validRealms: string[] = [MASTER_TENANT_SLUG, 'plexica-admin'];
  if (process.env.NODE_ENV !== 'production') {
    validRealms.push('plexica-test');
  }
  if (!validRealms.includes(request.user.tenantSlug)) {
    request.log.warn(
      { userId: request.user.id, tenantSlug: request.user.tenantSlug },
      'Unauthorized super admin access attempt from invalid realm'
    );
    return reply.code(403).send({
      error: {
        code: 'AUTH_SUPER_ADMIN_REQUIRED',
        message: 'Super admin access required',
        details: {
          userRealm: request.user.tenantSlug,
          validRealms,
        },
      },
    });
  }

  // Check for super_admin or super-admin role (support both formats)
  const hasRole =
    request.user.roles.includes(USER_ROLES.SUPER_ADMIN) ||
    request.user.roles.includes('super-admin');

  if (!hasRole) {
    request.log.warn(
      { userId: request.user.id, userRoles: request.user.roles },
      'Unauthorized super admin access attempt - missing super_admin role'
    );
    return reply.code(403).send({
      error: {
        code: 'AUTH_SUPER_ADMIN_REQUIRED',
        message: 'Super admin role required',
        details: {
          userRoles: request.user.roles,
        },
      },
    });
  }
}

/**
 * Tenant owner middleware
 * Only allows access to tenant owners or super admins
 *
 * Constitution Compliance: Article 6.2 (error format)
 */
export async function requireTenantOwner(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
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
      error: {
        code: 'AUTH_TENANT_OWNER_REQUIRED',
        message: 'Tenant owner or admin access required',
        details: {
          userRoles: request.user.roles,
          requiredRoles: [USER_ROLES.TENANT_OWNER, USER_ROLES.ADMIN],
        },
      },
    });
  }
}

/**
 * Tenant access middleware
 * Verifies that the authenticated user belongs to the tenant specified in the URL path
 *
 * CRITICAL SECURITY: Prevents cross-tenant data access by validating that
 * request.params.id (tenant ID from URL) matches the user's tenant context.
 *
 * Super admins from master realm can access any tenant.
 *
 * Usage:
 * fastify.get('/tenants/:id/resources',
 *   { preHandler: [authMiddleware, requireTenantAccess] },
 *   handler
 * )
 *
 * Constitution Compliance: Article 1.2 (Multi-Tenancy Isolation), Article 5.1 (Tenant Validation), Article 6.2 (error format)
 */
export async function requireTenantAccess(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
    });
  }

  // Extract tenant ID from URL path parameter
  const requestedTenantId = request.params.id;

  if (!requestedTenantId) {
    request.log.error({ params: request.params }, 'Missing tenant ID in path parameters');
    return reply.code(400).send({
      error: {
        code: 'TENANT_ID_REQUIRED',
        message: 'Tenant ID is required in the URL path',
        details: {
          params: request.params,
        },
      },
    });
  }

  // Super admins from master realm can access any tenant
  if (
    request.user.tenantSlug === MASTER_TENANT_SLUG &&
    request.user.roles.includes(USER_ROLES.SUPER_ADMIN)
  ) {
    request.log.info(
      { userId: request.user.id, requestedTenantId },
      'Super admin accessing tenant resource'
    );
    return;
  }

  // Fetch the user's tenant to get the UUID
  let userTenant;
  try {
    userTenant = await tenantService.getTenantBySlug(request.user.tenantSlug);
  } catch (error: any) {
    request.log.error(
      { error: error.message, tenantSlug: request.user.tenantSlug },
      'Failed to fetch user tenant'
    );
    return reply.code(500).send({
      error: {
        code: 'TENANT_FETCH_FAILED',
        message: 'Failed to verify tenant access',
        details: {
          tenantSlug: request.user.tenantSlug,
          reason: error.message,
        },
      },
    });
  }

  if (!userTenant) {
    request.log.error(
      { tenantSlug: request.user.tenantSlug },
      'User tenant not found - possible data inconsistency'
    );
    return reply.code(403).send({
      error: {
        code: 'AUTH_TENANT_NOT_FOUND',
        message: 'User tenant not found',
        details: {
          tenantSlug: request.user.tenantSlug,
        },
      },
    });
  }

  // Verify the requested tenant ID matches the user's tenant UUID
  if (userTenant.id !== requestedTenantId) {
    request.log.warn(
      {
        userId: request.user.id,
        userTenantId: userTenant.id,
        requestedTenantId,
        path: request.url,
      },
      '[SECURITY] Cross-tenant access attempt detected'
    );
    return reply.code(403).send({
      error: {
        code: 'AUTH_CROSS_TENANT',
        message: 'You do not have access to this tenant',
        details: {
          userTenantId: userTenant.id,
          requestedTenantId,
        },
      },
    });
  }

  // Access granted - user belongs to the requested tenant
  request.log.debug(
    { userId: request.user.id, tenantId: requestedTenantId },
    'Tenant access verified'
  );
}
