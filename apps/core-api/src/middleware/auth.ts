import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  extractBearerToken,
  verifyTokenWithTenant,
  extractUserInfo,
  type KeycloakJwtPayload,
  type UserInfo,
} from '../lib/jwt.js';
import { authorizationService } from '../modules/authorization/authorization.service.js';
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
          code: 'AUTH_MISSING_TOKEN',
          message: 'Missing or invalid Authorization header',
        },
      });
    }

    // Verify token and extract tenant
    const payload = await verifyTokenWithTenant(token);

    // Check if user is super admin (skip tenant validation for super admins)
    const roles = payload.realm_access?.roles ?? [];
    const isSuperAdmin =
      roles.includes(USER_ROLES.SUPER_ADMIN) ||
      roles.includes('super-admin') ||
      roles.includes('super_admin');

    // Validate tenant exists and is not suspended (FR-012, Edge Case #9)
    // SKIP tenant validation for super admins (they operate platform-wide)
    //
    // CROSS-TENANT NOTE: When a regular user sends an x-tenant-slug header pointing to a
    // DIFFERENT tenant than their JWT tenant, this is a cross-tenant request. In that case
    // we skip the JWT-tenant DB lookup here — tenantContextMiddleware runs after authMiddleware
    // and is fully responsible for validating the resolved tenant (including DELETED → 404,
    // SUSPENDED → 403, and cross-tenant guard → 403). Looking up the JWT tenant for cross-tenant
    // requests is redundant and incorrectly 403s when the JWT tenant no longer exists in DB
    // (e.g. after a test resetAll() or a real tenant deletion while token is still valid).
    let tenant;
    if (!isSuperAdmin) {
      const headerTenantSlug = request.headers['x-tenant-slug'] as string | undefined;
      const isCrossTenantRequest =
        headerTenantSlug &&
        headerTenantSlug.trim() !== '' &&
        headerTenantSlug !== payload.tenantSlug;

      if (!isCrossTenantRequest) {
        // Same-tenant request: validate JWT tenant exists and is not suspended
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
      }
      // Cross-tenant requests: tenantContextMiddleware handles all tenant status validation
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

      // Skip validation if super admin (already checked above)
      if (!isSuperAdmin && tenant) {
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
      // NFR-004: Do NOT expose required role names in the response body
      return reply.code(403).send({
        error: {
          code: 'AUTH_INSUFFICIENT_ROLE',
          message: 'You do not have the required role to perform this action',
        },
      });
    }
  };
}

/**
 * Permission-based access control middleware
 * Delegates to AuthorizationService (Redis-cached RBAC + wildcard matching).
 *
 * Spec 003 Task 2.8
 * - NFR-003: Audit log on every decision (emitted inside AuthorizationService)
 * - NFR-004: 403 body MUST NOT contain permission names
 * - NFR-005: Fail-closed — any unexpected error returns DENY (not 500)
 *
 * Usage:
 * fastify.get('/posts', { preHandler: [authMiddleware, requirePermission('posts:read')] }, handler)
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

    const { id: userId, tenantSlug } = request.user;
    const schemaName = tenantService.getSchemaName(tenantSlug);

    // Resolve tenantId from slug — needed for the authorization cache key.
    // tenantService.getSchemaName() is pure (no I/O); getTenantBySlug() is
    // lightweight (cached in-process). On failure: fail-closed → DENY.
    let tenantId: string;
    try {
      const tenant = await tenantService.getTenantBySlug(tenantSlug);
      tenantId = tenant.id;
    } catch {
      // Unknown / suspended tenant — deny access (NFR-005 fail-closed)
      return reply.code(403).send({
        error: {
          code: 'AUTH_INSUFFICIENT_PERMISSION',
          message: 'You do not have permission to perform this action',
        },
      });
    }

    // AuthorizationService is fail-closed: it never throws; it returns DENY on errors (NFR-005)
    const result = await authorizationService.authorize(userId, tenantId, schemaName, permissions);

    if (!result.permitted) {
      // NFR-004: No permission names in the response body
      return reply.code(403).send({
        error: {
          code: 'AUTH_INSUFFICIENT_PERMISSION',
          message: 'You do not have permission to perform this action',
        },
      });
    }
  };
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
