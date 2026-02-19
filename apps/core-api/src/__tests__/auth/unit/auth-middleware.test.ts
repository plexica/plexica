/**
 * Unit tests for auth middleware (Task 4.6.1)
 *
 * Tests all middleware functions with Constitution-compliant error format:
 * - authMiddleware: JWT verification, tenant validation, cross-tenant check
 * - requireRole: Role-based access control
 * - requirePermission: Permission-based access control
 * - requireSuperAdmin: Super admin access control
 * - requireTenantOwner: Tenant owner access control
 * - requireTenantAccess: Cross-tenant access prevention
 *
 * Coverage Target: ≥90%
 * Constitution Compliance: Articles 1.2, 5.1, 6.2, 6.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  authMiddleware,
  requireRole,
  requirePermission,
  requireSuperAdmin,
  requireTenantOwner,
  requireTenantAccess,
} from '../../../middleware/auth.js';
import type { KeycloakJwtPayload, UserInfo } from '../../../lib/jwt.js';
import type { Tenant } from '@plexica/database';
import { USER_ROLES, MASTER_TENANT_SLUG } from '../../../constants/index.js';

// Mock dependencies
vi.mock('../../../lib/jwt.js', () => ({
  extractBearerToken: vi.fn(),
  verifyTokenWithTenant: vi.fn(),
  extractUserInfo: vi.fn(),
}));

vi.mock('../../../services/tenant.service.js', () => ({
  tenantService: {
    getTenantBySlug: vi.fn(),
    getTenantById: vi.fn(),
    getSchemaName: vi.fn((slug: string) => `tenant_${slug}`),
  },
}));

vi.mock('../../../services/permission.service.js', () => ({
  permissionService: {
    getUserPermissions: vi.fn(),
  },
}));

import * as jwtLib from '../../../lib/jwt.js';
import { tenantService } from '../../../services/tenant.service.js';
import { permissionService } from '../../../services/permission.service.js';

// Test helpers
function createMockRequest(overrides?: Partial<FastifyRequest>): FastifyRequest {
  return {
    headers: {},
    url: '/api/test',
    log: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
    user: undefined,
    token: undefined,
    params: {},
    ...overrides,
  } as unknown as FastifyRequest;
}

function createMockReply(): FastifyReply {
  const reply: any = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sent: false,
  };
  return reply;
}

function createMockTenant(overrides?: Partial<Tenant>): Tenant {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Acme Corp',
    slug: 'acme-corp',
    status: 'ACTIVE' as const,
    settings: {},
    theme: {},
    translationOverrides: {},
    defaultLocale: 'en',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createMockJwtPayload(overrides?: Partial<KeycloakJwtPayload>): KeycloakJwtPayload {
  return {
    sub: 'user-123',
    email: 'user@acme.com',
    preferred_username: 'testuser',
    given_name: 'Test',
    family_name: 'User',
    realm: 'acme-corp',
    tenantSlug: 'acme-corp',
    roles: ['user'],
    teams: [],
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

function createMockUserInfo(overrides?: Partial<UserInfo>): UserInfo {
  return {
    id: 'user-123',
    username: 'testuser',
    email: 'user@acme.com',
    name: 'Test User',
    roles: ['user'],
    ...overrides,
  };
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should authenticate successfully with valid token', async () => {
    const mockRequest = createMockRequest({
      headers: { authorization: 'Bearer valid-token' },
    });
    const mockReply = createMockReply();

    const mockPayload = createMockJwtPayload();
    const mockUserInfo = createMockUserInfo();
    const mockTenant = createMockTenant();

    vi.mocked(jwtLib.extractBearerToken).mockReturnValue('valid-token');
    vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(
      mockPayload as KeycloakJwtPayload & { tenantSlug: string }
    );
    vi.mocked(jwtLib.extractUserInfo).mockReturnValue(mockUserInfo);
    vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant);

    await authMiddleware(mockRequest, mockReply);

    expect(mockRequest.user).toEqual({
      ...mockUserInfo,
      tenantSlug: 'acme-corp',
    });
    expect(mockRequest.token).toEqual(mockPayload);
    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should return 401 AUTH_TOKEN_MISSING when no bearer token', async () => {
    const mockRequest = createMockRequest({
      headers: {},
    });
    const mockReply = createMockReply();

    vi.mocked(jwtLib.extractBearerToken).mockReturnValue(null);

    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_TOKEN_MISSING',
        message: 'Missing or invalid Authorization header',
      },
    });
  });

  it('should return 401 AUTH_TOKEN_EXPIRED when token expired', async () => {
    const mockRequest = createMockRequest({
      headers: { authorization: 'Bearer expired-token' },
    });
    const mockReply = createMockReply();

    vi.mocked(jwtLib.extractBearerToken).mockReturnValue('expired-token');
    vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(
      new Error('Token expired at 2024-01-01')
    );

    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_TOKEN_EXPIRED',
        message: 'Token has expired',
      },
    });
  });

  it('should return 401 AUTH_TOKEN_INVALID when token invalid', async () => {
    const mockRequest = createMockRequest({
      headers: { authorization: 'Bearer invalid-token' },
    });
    const mockReply = createMockReply();

    vi.mocked(jwtLib.extractBearerToken).mockReturnValue('invalid-token');
    vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(new Error('Invalid signature'));

    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    // SECURITY: No `details.reason` in response — error.message from jwt library
    // can leak internal Keycloak URLs, expected audiences, and algorithm info.
    // See HIGH #3 fix in middleware/auth.ts lines 150-158.
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid or malformed token',
      },
    });
  });

  it('should return 403 AUTH_TENANT_NOT_FOUND when tenant does not exist', async () => {
    const mockRequest = createMockRequest({
      headers: { authorization: 'Bearer valid-token' },
    });
    const mockReply = createMockReply();

    const mockPayload = createMockJwtPayload({ tenantSlug: 'nonexistent' });

    vi.mocked(jwtLib.extractBearerToken).mockReturnValue('valid-token');
    vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(
      mockPayload as KeycloakJwtPayload & { tenantSlug: string }
    );
    vi.mocked(tenantService.getTenantBySlug).mockRejectedValue(new Error('Tenant not found'));

    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_TENANT_NOT_FOUND',
        message: 'The tenant associated with this token does not exist',
        details: {
          tenantSlug: 'nonexistent',
        },
      },
    });
  });

  it('should return 403 AUTH_TENANT_SUSPENDED when tenant is suspended (Edge Case #9)', async () => {
    const mockRequest = createMockRequest({
      headers: { authorization: 'Bearer valid-token' },
    });
    const mockReply = createMockReply();

    const mockPayload = createMockJwtPayload();
    const mockTenant = createMockTenant({ status: 'SUSPENDED' });

    vi.mocked(jwtLib.extractBearerToken).mockReturnValue('valid-token');
    vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(
      mockPayload as KeycloakJwtPayload & { tenantSlug: string }
    );
    vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant);

    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_TENANT_SUSPENDED',
        message: 'This tenant account is currently suspended. Please contact support.',
        details: {
          tenantSlug: 'acme-corp',
          status: 'SUSPENDED',
        },
      },
    });
  });

  it('should return 403 AUTH_CROSS_TENANT when JWT tenant does not match requested tenant', async () => {
    const mockRequest = createMockRequest({
      headers: { authorization: 'Bearer valid-token' },
      url: '/api/v1/tenants/different-tenant-id/workspaces',
    });
    const mockReply = createMockReply();

    const mockPayload = createMockJwtPayload();
    const mockUserInfo = createMockUserInfo();
    const mockTenant = createMockTenant();

    vi.mocked(jwtLib.extractBearerToken).mockReturnValue('valid-token');
    vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(
      mockPayload as KeycloakJwtPayload & { tenantSlug: string }
    );
    vi.mocked(jwtLib.extractUserInfo).mockReturnValue(mockUserInfo);
    vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant);

    await authMiddleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_CROSS_TENANT',
        message: 'Token not valid for this tenant',
        details: {
          jwtTenant: 'acme-corp',
          requestedTenantId: 'different-tenant-id',
        },
      },
    });
  });

  it('should allow super admin cross-tenant access', async () => {
    const mockRequest = createMockRequest({
      headers: { authorization: 'Bearer super-admin-token' },
      url: '/api/v1/tenants/different-tenant-id/workspaces',
    });
    const mockReply = createMockReply();

    // Super admin from master realm
    const mockPayload = createMockJwtPayload({
      realm: 'master',
      tenantSlug: 'master',
      roles: ['super-admin'],
      realm_access: { roles: ['super-admin'] },
    });
    const mockUserInfo = createMockUserInfo({ roles: ['super-admin'] });
    const mockTenant = createMockTenant({ slug: 'master' });

    vi.mocked(jwtLib.extractBearerToken).mockReturnValue('super-admin-token');
    vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(
      mockPayload as KeycloakJwtPayload & { tenantSlug: string }
    );
    vi.mocked(jwtLib.extractUserInfo).mockReturnValue(mockUserInfo);
    vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant);

    await authMiddleware(mockRequest, mockReply);

    // Should set user and NOT return error
    expect(mockRequest.user).toEqual({
      ...mockUserInfo,
      tenantSlug: 'master',
    });
    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should succeed when no tenant context in URL', async () => {
    const mockRequest = createMockRequest({
      headers: { authorization: 'Bearer valid-token' },
      url: '/api/v1/plugins',
    });
    const mockReply = createMockReply();

    const mockPayload = createMockJwtPayload();
    const mockUserInfo = createMockUserInfo();
    const mockTenant = createMockTenant();

    vi.mocked(jwtLib.extractBearerToken).mockReturnValue('valid-token');
    vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(
      mockPayload as KeycloakJwtPayload & { tenantSlug: string }
    );
    vi.mocked(jwtLib.extractUserInfo).mockReturnValue(mockUserInfo);
    vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant);

    await authMiddleware(mockRequest, mockReply);

    expect(mockRequest.user).toBeDefined();
    expect(mockReply.code).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 AUTH_REQUIRED when not authenticated', async () => {
    const mockRequest = createMockRequest();
    const mockReply = createMockReply();

    const middleware = requireRole('admin');
    await middleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
    });
  });

  it('should return 403 AUTH_INSUFFICIENT_ROLE when user lacks required role', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: ['user', 'viewer'] }),
        tenantSlug: 'acme-corp',
      },
    });
    const mockReply = createMockReply();

    const middleware = requireRole('admin');
    await middleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_INSUFFICIENT_ROLE',
        message: 'Required role(s): admin',
        details: {
          requiredRoles: ['admin'],
          userRoles: ['user', 'viewer'],
        },
      },
    });
  });

  it('should pass when user has required role', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: ['admin', 'user'] }),
        tenantSlug: 'acme-corp',
      },
    });
    const mockReply = createMockReply();

    const middleware = requireRole('admin');
    await middleware(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should pass when user has one of multiple required roles', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: ['editor', 'user'] }),
        tenantSlug: 'acme-corp',
      },
    });
    const mockReply = createMockReply();

    const middleware = requireRole('admin', 'editor', 'owner');
    await middleware(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });
});

describe('requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 AUTH_REQUIRED when not authenticated', async () => {
    const mockRequest = createMockRequest();
    const mockReply = createMockReply();

    const middleware = requirePermission('posts.read');
    await middleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
    });
  });

  it('should return 403 AUTH_INSUFFICIENT_PERMISSION when user lacks required permission', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo(),
        tenantSlug: 'acme-corp',
      },
    });
    const mockReply = createMockReply();

    vi.mocked(permissionService.getUserPermissions).mockResolvedValue(['posts.write']);

    const middleware = requirePermission('posts.delete');
    await middleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_INSUFFICIENT_PERMISSION',
        message: 'Required permission(s): posts.delete',
        details: {
          requiredPermissions: ['posts.delete'],
        },
      },
    });
  });

  it('should return 500 PERMISSION_CHECK_FAILED on database error', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo(),
        tenantSlug: 'acme-corp',
      },
    });
    const mockReply = createMockReply();

    vi.mocked(permissionService.getUserPermissions).mockRejectedValue(
      new Error('Database connection failed')
    );

    const middleware = requirePermission('posts.read');
    await middleware(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(500);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'PERMISSION_CHECK_FAILED',
        message: 'Failed to verify permissions',
        details: {
          reason: 'Database connection failed',
        },
      },
    });
  });

  it('should pass when user has required permission', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo(),
        tenantSlug: 'acme-corp',
      },
    });
    const mockReply = createMockReply();

    vi.mocked(permissionService.getUserPermissions).mockResolvedValue([
      'posts.read',
      'posts.write',
    ]);

    const middleware = requirePermission('posts.read');
    await middleware(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });
});

describe('requireSuperAdmin', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should bypass auth in development with BYPASS_AUTH=true', async () => {
    process.env.BYPASS_AUTH = 'true';
    process.env.NODE_ENV = 'development';

    const mockRequest = createMockRequest();
    const mockReply = createMockReply();

    await requireSuperAdmin(mockRequest, mockReply);

    expect(mockRequest.user).toEqual({
      id: 'dev-super-admin',
      username: 'dev-admin',
      name: 'Development Super Admin',
      email: 'dev@plexica.local',
      roles: ['super-admin', 'super_admin'],
      tenantSlug: 'plexica-admin',
    });
    expect(mockReply.code).not.toHaveBeenCalled();
  });

  it('should not bypass auth in production even with BYPASS_AUTH=true', async () => {
    process.env.BYPASS_AUTH = 'true';
    process.env.NODE_ENV = 'production';

    const mockRequest = createMockRequest();
    const mockReply = createMockReply();

    // Mock authMiddleware behavior
    vi.mocked(jwtLib.extractBearerToken).mockReturnValue(null);

    await requireSuperAdmin(mockRequest, mockReply);

    expect(mockRequest.user).toBeUndefined();
  });

  it('should return 401 AUTH_REQUIRED when not authenticated', async () => {
    const mockRequest = createMockRequest();
    const mockReply = createMockReply();

    await requireSuperAdmin(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
    });
  });

  it('should return 403 AUTH_SUPER_ADMIN_REQUIRED when not from valid realm', async () => {
    // Set NODE_ENV to production to ensure plexica-test is NOT in validRealms
    process.env.NODE_ENV = 'production';

    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: [USER_ROLES.SUPER_ADMIN] }),
        tenantSlug: 'acme-corp',
      },
    });
    const mockReply = createMockReply();

    await requireSuperAdmin(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_SUPER_ADMIN_REQUIRED',
        message: 'Super admin access required',
        details: {
          userRealm: 'acme-corp',
          validRealms: [MASTER_TENANT_SLUG, 'plexica-admin'],
        },
      },
    });
  });

  it('should return 403 AUTH_SUPER_ADMIN_REQUIRED when missing super_admin role', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: ['admin'] }),
        tenantSlug: MASTER_TENANT_SLUG,
      },
    });
    const mockReply = createMockReply();

    await requireSuperAdmin(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_SUPER_ADMIN_REQUIRED',
        message: 'Super admin role required',
        details: {
          userRoles: ['admin'],
        },
      },
    });
  });

  it('should pass for super_admin from master realm', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: [USER_ROLES.SUPER_ADMIN] }),
        tenantSlug: MASTER_TENANT_SLUG,
      },
    });
    const mockReply = createMockReply();

    await requireSuperAdmin(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should pass for super_admin from plexica-admin realm', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: [USER_ROLES.SUPER_ADMIN] }),
        tenantSlug: 'plexica-admin',
      },
    });
    const mockReply = createMockReply();

    await requireSuperAdmin(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should pass for super-admin role (kebab-case variant)', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: ['super-admin'] }),
        tenantSlug: MASTER_TENANT_SLUG,
      },
    });
    const mockReply = createMockReply();

    await requireSuperAdmin(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should allow plexica-test realm in non-production', async () => {
    process.env.NODE_ENV = 'test';

    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: [USER_ROLES.SUPER_ADMIN] }),
        tenantSlug: 'plexica-test',
      },
    });
    const mockReply = createMockReply();

    await requireSuperAdmin(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });
});

describe('requireTenantOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 AUTH_REQUIRED when not authenticated', async () => {
    const mockRequest = createMockRequest();
    const mockReply = createMockReply();

    await requireTenantOwner(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
    });
  });

  it('should pass for super admin from master realm', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: [USER_ROLES.SUPER_ADMIN] }),
        tenantSlug: MASTER_TENANT_SLUG,
      },
    });
    const mockReply = createMockReply();

    await requireTenantOwner(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should return 403 AUTH_TENANT_OWNER_REQUIRED when missing role', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: ['user'] }),
        tenantSlug: 'acme-corp',
      },
    });
    const mockReply = createMockReply();

    await requireTenantOwner(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_TENANT_OWNER_REQUIRED',
        message: 'Tenant owner or admin access required',
        details: {
          userRoles: ['user'],
          requiredRoles: [USER_ROLES.TENANT_OWNER, USER_ROLES.ADMIN],
        },
      },
    });
  });

  it('should pass for tenant_owner role', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: [USER_ROLES.TENANT_OWNER] }),
        tenantSlug: 'acme-corp',
      },
    });
    const mockReply = createMockReply();

    await requireTenantOwner(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should pass for admin role', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: [USER_ROLES.ADMIN] }),
        tenantSlug: 'acme-corp',
      },
    });
    const mockReply = createMockReply();

    await requireTenantOwner(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });
});

describe('requireTenantAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 AUTH_REQUIRED when not authenticated', async () => {
    const mockRequest = createMockRequest({
      params: { id: 'tenant-123' },
    });
    const mockReply = createMockReply();

    await requireTenantAccess(mockRequest as any, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
    });
  });

  it('should return 400 TENANT_ID_REQUIRED when tenant ID missing in path', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo(),
        tenantSlug: 'acme-corp',
      },
      params: {},
    });
    const mockReply = createMockReply();

    await requireTenantAccess(mockRequest as any, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'TENANT_ID_REQUIRED',
        message: 'Tenant ID is required in the URL path',
        details: {
          params: {},
        },
      },
    });
  });

  it('should pass for super admin accessing any tenant', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo({ roles: [USER_ROLES.SUPER_ADMIN] }),
        tenantSlug: MASTER_TENANT_SLUG,
      },
      params: { id: 'any-tenant-id' },
    });
    const mockReply = createMockReply();

    await requireTenantAccess(mockRequest as any, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should return 500 TENANT_FETCH_FAILED on database error', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo(),
        tenantSlug: 'acme-corp',
      },
      params: { id: 'tenant-123' },
    });
    const mockReply = createMockReply();

    vi.mocked(tenantService.getTenantBySlug).mockRejectedValue(
      new Error('Database connection failed')
    );

    await requireTenantAccess(mockRequest as any, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(500);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'TENANT_FETCH_FAILED',
        message: 'Failed to verify tenant access',
        details: {
          tenantSlug: 'acme-corp',
          reason: 'Database connection failed',
        },
      },
    });
  });

  it('should return 403 AUTH_TENANT_NOT_FOUND when user tenant not found', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo(),
        tenantSlug: 'acme-corp',
      },
      params: { id: 'tenant-123' },
    });
    const mockReply = createMockReply();

    vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(null as any);

    await requireTenantAccess(mockRequest as any, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_TENANT_NOT_FOUND',
        message: 'User tenant not found',
        details: {
          tenantSlug: 'acme-corp',
        },
      },
    });
  });

  it('should return 403 AUTH_CROSS_TENANT when tenant ID mismatch', async () => {
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo(),
        tenantSlug: 'acme-corp',
      },
      params: { id: 'different-tenant-id' },
      url: '/api/v1/tenants/different-tenant-id/resources',
    });
    const mockReply = createMockReply();

    const mockTenant = createMockTenant({
      id: 'acme-tenant-id',
      slug: 'acme-corp',
    });

    vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant);

    await requireTenantAccess(mockRequest as any, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_CROSS_TENANT',
        message: 'You do not have access to this tenant',
        details: {
          userTenantId: 'acme-tenant-id',
          requestedTenantId: 'different-tenant-id',
        },
      },
    });
  });

  it('should pass when tenant ID matches user tenant', async () => {
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    const mockRequest = createMockRequest({
      user: {
        ...createMockUserInfo(),
        tenantSlug: 'acme-corp',
      },
      params: { id: tenantId },
    });
    const mockReply = createMockReply();

    const mockTenant = createMockTenant({
      id: tenantId,
      slug: 'acme-corp',
    });

    vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant);

    await requireTenantAccess(mockRequest as any, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });
});
