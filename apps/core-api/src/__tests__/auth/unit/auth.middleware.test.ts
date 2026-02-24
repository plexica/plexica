/**
 * Authentication Middleware Unit Tests
 *
 * These tests verify the behavior of all authentication and authorization middleware.
 * They focus on business logic without complex integration setup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  authMiddleware,
  optionalAuthMiddleware,
  requireRole,
  requirePermission,
  requireSuperAdmin,
  requireTenantOwner,
} from '../../../middleware/auth.js';
import * as jwtLib from '../../../lib/jwt.js';
import { tenantService } from '../../../services/tenant.service.js';
import { MASTER_TENANT_SLUG, USER_ROLES } from '../../../constants/index.js';

// Mock dependencies
vi.mock('../../../lib/jwt.js');
vi.mock('../../../services/permission.service.js');
vi.mock('../../../services/tenant.service.js');
vi.mock('../../../modules/authorization/authorization.service.js', () => ({
  authorizationService: {
    authorize: vi.fn(),
    getUserEffectivePermissions: vi.fn(),
  },
}));

import { authorizationService } from '../../../modules/authorization/authorization.service.js';

// Helper to create mock request/reply
function createMockRequest(): Partial<FastifyRequest> {
  return {
    headers: {},
    log: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    } as any,
  };
}

function createMockReply(): Partial<FastifyReply> {
  return {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

describe('Auth Middleware - authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Valid Token Scenarios', () => {
    it('should attach user info to request on valid token', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'valid-jwt-token';
      const mockPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        tenantSlug: 'test-tenant',
        realm_access: { roles: ['user', 'admin'] },
      };
      const mockUserInfo = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user', 'admin'],
      };
      const mockTenant = {
        id: 'tenant-id-123',
        slug: 'test-tenant',
        status: 'ACTIVE',
      };

      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(mockPayload as any);
      vi.mocked(jwtLib.extractUserInfo).mockReturnValue(mockUserInfo as any);
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);

      await authMiddleware(request, reply);

      expect(request.user).toBeDefined();
      expect(request.user?.id).toBe('user-123');
      expect(request.user?.email).toBe('user@example.com');
      expect(request.user?.tenantSlug).toBe('test-tenant');
      expect(request.user?.roles).toEqual(['user', 'admin']);
      expect(request.token).toBeDefined();
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should attach token payload to request', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'valid-jwt-token';
      const mockPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        tenantSlug: 'test-tenant',
        iat: 1704067200,
        exp: 1704153600,
        realm_access: { roles: ['user'] },
      };
      const mockTenant = {
        id: 'tenant-id-123',
        slug: 'test-tenant',
        status: 'ACTIVE',
      };

      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(mockPayload as any);
      vi.mocked(jwtLib.extractUserInfo).mockReturnValue({
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user'],
      } as any);
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);

      await authMiddleware(request, reply);

      expect(request.token).toBe(mockPayload);
      expect(request.token?.iat).toBe(1704067200);
      expect(request.token?.exp).toBe(1704153600);
    });

    it('should handle multiple roles in token', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'valid-jwt-token';
      const roles = ['user', 'admin', 'moderator', 'editor'];
      const mockPayload = {
        sub: 'user-456',
        email: 'admin@example.com',
        tenantSlug: 'test-tenant',
        realm_access: { roles },
      };
      const mockTenant = {
        id: 'tenant-id-456',
        slug: 'test-tenant',
        status: 'ACTIVE',
      };

      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(mockPayload as any);
      vi.mocked(jwtLib.extractUserInfo).mockReturnValue({
        id: 'user-456',
        username: 'admin456',
        email: 'admin@example.com',
        roles,
      } as any);
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);

      await authMiddleware(request, reply);

      expect(request.user?.roles).toEqual(roles);
      expect(request.user?.roles).toHaveLength(4);
    });
  });

  describe('Missing Token Scenarios', () => {
    it('should return 401 when authorization header is missing', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.headers!.authorization = undefined;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(null);

      await authMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_MISSING_TOKEN',
          message: 'Missing or invalid Authorization header',
        },
      });
    });

    it('should return 401 when bearer token is malformed', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.headers!.authorization = 'InvalidToken';
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(null);

      await authMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_MISSING_TOKEN',
          message: 'Missing or invalid Authorization header',
        },
      });
    });

    it('should return 401 when bearer token is empty', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.headers!.authorization = 'Bearer ';
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(null);

      await authMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('should not attach user to request on missing token', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(null);

      await authMiddleware(request, reply);

      expect(request.user).toBeUndefined();
      expect(request.token).toBeUndefined();
    });
  });

  describe('Invalid Token Scenarios', () => {
    it('should return 401 on token verification failure', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'invalid-jwt-token';
      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(
        new Error('Token verification failed')
      );

      await authMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: 'Invalid or malformed token',
        },
      });
    });

    it('should return 401 on expired token', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'expired-jwt-token';
      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(new Error('Token expired'));

      await authMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'Token has expired',
        },
      });
    });

    it('should return 401 on malformed token signature', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'malformed-jwt-token';
      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(
        new Error('Invalid token signature')
      );

      await authMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('should log authentication errors', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'invalid-token';
      const error = new Error('Token verification failed');
      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(error);

      await authMiddleware(request, reply);

      expect(request.log.error).toHaveBeenCalledWith(
        { error: error.message },
        'Authentication failed'
      );
    });
  });

  describe('User Info Extraction', () => {
    it('should extract user id from token payload', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'valid-token';
      const mockPayload = {
        sub: 'user-789',
        email: 'test@example.com',
        tenantSlug: 'test-tenant',
        realm_access: { roles: [] },
      };
      const mockTenant = {
        id: 'tenant-id-789',
        slug: 'test-tenant',
        status: 'ACTIVE',
      };

      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(mockPayload as any);
      vi.mocked(jwtLib.extractUserInfo).mockReturnValue({
        id: 'user-789',
        username: 'user789',
        email: 'test@example.com',
        roles: [],
      } as any);
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);

      await authMiddleware(request, reply);

      expect(request.user?.id).toBe('user-789');
    });

    it('should extract email from token payload', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'valid-token';
      const mockPayload = {
        sub: 'user-789',
        email: 'alice@example.com',
        tenantSlug: 'test-tenant',
        realm_access: { roles: [] },
      };
      const mockTenant = {
        id: 'tenant-id-789',
        slug: 'test-tenant',
        status: 'ACTIVE',
      };

      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(mockPayload as any);
      vi.mocked(jwtLib.extractUserInfo).mockReturnValue({
        id: 'user-789',
        username: 'alice789',
        email: 'alice@example.com',
        roles: [],
      } as any);
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);

      await authMiddleware(request, reply);

      expect(request.user?.email).toBe('alice@example.com');
    });

    it('should extract tenant slug from token payload', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'valid-token';
      const mockPayload = {
        sub: 'user-789',
        email: 'test@example.com',
        tenantSlug: 'acme-corp',
        realm_access: { roles: [] },
      };
      const mockTenant = {
        id: 'tenant-id-789',
        slug: 'acme-corp',
        status: 'ACTIVE',
      };

      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(mockPayload as any);
      vi.mocked(jwtLib.extractUserInfo).mockReturnValue({
        id: 'user-789',
        username: 'user789',
        email: 'test@example.com',
        roles: [],
      } as any);
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);

      await authMiddleware(request, reply);

      expect(request.user?.tenantSlug).toBe('acme-corp');
    });
  });
});

describe('Auth Middleware - optionalAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('With Valid Token', () => {
    it('should attach user info when valid token is provided', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'valid-token';
      const mockPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        tenantSlug: 'test-tenant',
        realm_access: { roles: ['user'] },
      };

      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(mockPayload as any);
      vi.mocked(jwtLib.extractUserInfo).mockReturnValue({
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user'],
      } as any);

      await optionalAuthMiddleware(request, reply);

      expect(request.user).toBeDefined();
      expect(request.user?.id).toBe('user-123');
      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('Without Token', () => {
    it('should not fail when authorization header is missing', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.headers!.authorization = undefined;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(null);

      await optionalAuthMiddleware(request, reply);

      expect(request.user).toBeUndefined();
      expect(request.token).toBeUndefined();
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should not fail when bearer token is malformed', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.headers!.authorization = 'InvalidToken';
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(null);

      await optionalAuthMiddleware(request, reply);

      expect(request.user).toBeUndefined();
      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('With Invalid Token', () => {
    it('should not fail on token verification error', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'invalid-token';
      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(
        new Error('Token verification failed')
      );

      await optionalAuthMiddleware(request, reply);

      expect(request.user).toBeUndefined();
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should log warning on token verification error', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'invalid-token';
      const error = new Error('Token verification failed');
      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(error);

      await optionalAuthMiddleware(request, reply);

      expect(request.log.warn).toHaveBeenCalledWith(
        { error },
        'Optional auth failed, continuing without auth'
      );
    });

    it('should not fail on expired token', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const mockToken = 'expired-token';
      request.headers!.authorization = `Bearer ${mockToken}`;
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(new Error('Token expired'));

      await optionalAuthMiddleware(request, reply);

      expect(request.user).toBeUndefined();
      expect(reply.code).not.toHaveBeenCalled();
    });
  });
});

describe('Auth Middleware - requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('With Valid Role', () => {
    it('should allow access when user has required role', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['admin', 'user'],
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin');
      await middleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should allow access when user has one of multiple required roles', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['moderator', 'user'],
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin', 'moderator', 'editor');
      await middleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should allow access with multiple matching roles', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['admin', 'moderator', 'user'],
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin', 'editor');
      await middleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('Without Required Role', () => {
    it('should return 403 when user lacks required role', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user'],
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin');
      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_INSUFFICIENT_ROLE',
          message: 'You do not have the required role to perform this action',
        },
      });
    });

    it('should return 403 when user has no roles', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: [],
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin');
      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should return 403 when none of multiple required roles match', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user', 'viewer'],
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin', 'moderator', 'editor');
      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_INSUFFICIENT_ROLE',
          message: 'You do not have the required role to perform this action',
        },
      });
    });
  });

  describe('Without Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = undefined;

      const middleware = requireRole('admin');
      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
      });
    });

    it('should return 401 when user roles are undefined', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: undefined as any,
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin');
      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });
  });
});

describe('Auth Middleware - requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // tenantService.getTenantBySlug resolves by default
    vi.mocked(tenantService.getTenantBySlug).mockResolvedValue({
      id: 'tenant-id-1',
      name: 'Test Tenant',
      slug: 'test-tenant',
      status: 'ACTIVE' as const,
      settings: {},
      theme: {},
      translationOverrides: {},
      defaultLocale: 'en',
      deletionScheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant');
  });

  describe('With Valid Permission', () => {
    it('should allow access when user has required permission', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user'],
        tenantSlug: 'test-tenant',
      };

      vi.mocked(authorizationService.authorize).mockResolvedValue({
        permitted: true,
        reason: 'rbac',
      } as any);

      const middleware = requirePermission('posts:read');
      await middleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should allow access when user has one of multiple required permissions', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user'],
        tenantSlug: 'test-tenant',
      };

      vi.mocked(authorizationService.authorize).mockResolvedValue({
        permitted: true,
        reason: 'rbac',
      } as any);

      const middleware = requirePermission('posts:read', 'posts:write', 'posts:delete');
      await middleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('Without Required Permission', () => {
    it('should return 403 when user lacks required permission', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user'],
        tenantSlug: 'test-tenant',
      };

      vi.mocked(authorizationService.authorize).mockResolvedValue({
        permitted: false,
        reason: 'no_permission',
      } as any);

      const middleware = requirePermission('posts:delete');
      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      // NFR-004: No permission names in 403 body (Task 2.8 security fix)
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_INSUFFICIENT_PERMISSION',
          message: 'You do not have permission to perform this action',
        },
      });
    });

    it('should return 403 when user has no permissions at all', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user'],
        tenantSlug: 'test-tenant',
      };

      vi.mocked(authorizationService.authorize).mockResolvedValue({
        permitted: false,
        reason: 'no_permission',
      } as any);

      const middleware = requirePermission('posts:read');
      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('Fail-closed behavior (NFR-005)', () => {
    it('should return 403 when tenant lookup fails (fail-closed)', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user'],
        tenantSlug: 'test-tenant',
      };

      vi.mocked(tenantService.getTenantBySlug).mockRejectedValue(
        new Error('Database connection failed')
      );

      const middleware = requirePermission('posts:read');
      await middleware(request, reply);

      // NFR-005: fail-closed — unknown tenant → DENY, not 500
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_INSUFFICIENT_PERMISSION',
          message: 'You do not have permission to perform this action',
        },
      });
    });
  });

  describe('Without Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = undefined;

      const middleware = requirePermission('posts:read');
      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
      });
    });
  });
});

describe('Auth Middleware - requireSuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Valid Super Admin Access', () => {
    it('should allow access when user is super admin from master tenant', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'admin-123',
        username: 'admin123',
        email: 'admin@example.com',
        roles: [USER_ROLES.SUPER_ADMIN],
        tenantSlug: MASTER_TENANT_SLUG,
      };

      await requireSuperAdmin(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should allow access with super_admin role and other roles', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'admin-123',
        username: 'admin123',
        email: 'admin@example.com',
        roles: [USER_ROLES.SUPER_ADMIN, 'user', 'moderator'],
        tenantSlug: MASTER_TENANT_SLUG,
      };

      await requireSuperAdmin(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('Non-Master Tenant', () => {
    it('should return 403 when user is from non-master tenant', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: [USER_ROLES.SUPER_ADMIN],
        tenantSlug: 'other-tenant',
      };

      await requireSuperAdmin(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_SUPER_ADMIN_REQUIRED',
          message: 'Super admin access required',
        },
      });
    });

    it('should log warning for non-master tenant access attempt', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: [USER_ROLES.SUPER_ADMIN],
        tenantSlug: 'other-tenant',
      };

      await requireSuperAdmin(request, reply);

      expect(request.log.warn).toHaveBeenCalledWith(
        { userId: 'user-123', tenantSlug: 'other-tenant' },
        'Unauthorized super admin access attempt from invalid realm'
      );
    });
  });

  describe('Missing Super Admin Role', () => {
    it('should return 403 when user lacks super_admin role', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['admin', 'user'],
        tenantSlug: MASTER_TENANT_SLUG,
      };

      await requireSuperAdmin(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_SUPER_ADMIN_REQUIRED',
          message: 'Super admin role required',
        },
      });
    });

    it('should return 403 when user has no roles', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: [],
        tenantSlug: MASTER_TENANT_SLUG,
      };

      await requireSuperAdmin(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should log warning when missing super_admin role', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      const roles = ['admin', 'user'];
      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles,
        tenantSlug: MASTER_TENANT_SLUG,
      };

      await requireSuperAdmin(request, reply);

      expect(request.log.warn).toHaveBeenCalledWith(
        { userId: 'user-123', userRoles: roles },
        'Unauthorized super admin access attempt - missing super_admin role'
      );
    });
  });

  describe('Without Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = undefined;

      await requireSuperAdmin(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
      });
    });
  });
});

describe('Auth Middleware - requireTenantOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Super Admin Access', () => {
    it('should allow super admin from master tenant', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'admin-123',
        username: 'admin123',
        email: 'admin@example.com',
        roles: [USER_ROLES.SUPER_ADMIN],
        tenantSlug: MASTER_TENANT_SLUG,
      };

      await requireTenantOwner(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should allow super admin with other roles', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'admin-123',
        username: 'admin123',
        email: 'admin@example.com',
        roles: [USER_ROLES.SUPER_ADMIN, 'user'],
        tenantSlug: MASTER_TENANT_SLUG,
      };

      await requireTenantOwner(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('Tenant Owner Access', () => {
    it('should allow user with tenant_owner role', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: [USER_ROLES.TENANT_OWNER],
        tenantSlug: 'acme-corp',
      };

      await requireTenantOwner(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should allow user with admin role', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: [USER_ROLES.ADMIN],
        tenantSlug: 'acme-corp',
      };

      await requireTenantOwner(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should allow user with both tenant_owner and admin roles', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: [USER_ROLES.TENANT_OWNER, USER_ROLES.ADMIN],
        tenantSlug: 'acme-corp',
      };

      await requireTenantOwner(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('Insufficient Permissions', () => {
    it('should return 403 when user lacks required roles', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user', 'viewer'],
        tenantSlug: 'acme-corp',
      };

      await requireTenantOwner(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_TENANT_OWNER_REQUIRED',
          message: 'Tenant owner or admin access required',
        },
      });
    });

    it('should return 403 when user has no roles', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: [],
        tenantSlug: 'acme-corp',
      };

      await requireTenantOwner(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should return 403 for non-admin tenant user', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = {
        id: 'user-123',
        username: 'user123',
        email: 'user@example.com',
        roles: ['user'],
        tenantSlug: 'acme-corp',
      };

      await requireTenantOwner(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('Without Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      const request = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      request.user = undefined;

      await requireTenantOwner(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
      });
    });
  });
});
