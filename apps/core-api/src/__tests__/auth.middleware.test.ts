// Unit tests for auth middleware
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  authMiddleware,
  optionalAuthMiddleware,
  requireRole,
  requirePermission,
  requireSuperAdmin,
  requireTenantOwner,
} from '../middleware/auth';
import * as jwtLib from '../lib/jwt';
import { permissionService } from '../services/permission.service';
import { tenantService } from '../services/tenant.service';

// Mock dependencies
vi.mock('../lib/jwt');
vi.mock('../services/permission.service');
vi.mock('../services/tenant.service');

describe('Auth Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      headers: {},
      log: {
        error: vi.fn(),
        warn: vi.fn(),
      } as any,
    };

    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe('authMiddleware', () => {
    it('should authenticate user with valid token', async () => {
      const mockToken = 'valid.jwt.token';
      const mockPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        tenantSlug: 'test-tenant',
        email: 'test@example.com',
        realm_access: { roles: ['user'] },
      };
      const mockUserInfo = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
      };

      mockRequest.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(mockPayload as any);
      vi.mocked(jwtLib.extractUserInfo).mockReturnValue(mockUserInfo);

      await authMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toEqual({
        ...mockUserInfo,
        tenantSlug: 'test-tenant',
      });
      expect(mockRequest.token).toEqual(mockPayload);
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header is missing', async () => {
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(null);

      await authMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    });

    it('should return 401 when token verification fails', async () => {
      const mockToken = 'invalid.jwt.token';

      mockRequest.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(new Error('Invalid token'));

      await authMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    });

    it('should return 401 when token is expired', async () => {
      const mockToken = 'expired.jwt.token';

      mockRequest.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(new Error('Token expired'));

      await authMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Token expired',
      });
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should authenticate user when valid token is provided', async () => {
      const mockToken = 'valid.jwt.token';
      const mockPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        tenantSlug: 'test-tenant',
        realm_access: { roles: ['user'] },
      };
      const mockUserInfo = {
        id: 'user-123',
        username: 'testuser',
        roles: ['user'],
      };

      mockRequest.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockResolvedValue(mockPayload as any);
      vi.mocked(jwtLib.extractUserInfo).mockReturnValue(mockUserInfo);

      await optionalAuthMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toBeDefined();
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should continue without error when no token is provided', async () => {
      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(null);

      await optionalAuthMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toBeUndefined();
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should continue without error when token is invalid', async () => {
      const mockToken = 'invalid.jwt.token';

      mockRequest.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      vi.mocked(jwtLib.extractBearerToken).mockReturnValue(mockToken);
      vi.mocked(jwtLib.verifyTokenWithTenant).mockRejectedValue(new Error('Invalid token'));

      await optionalAuthMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toBeUndefined();
      expect(mockReply.code).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow access when user has required role', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'testuser',
        roles: ['admin', 'user'],
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow access when user has any of the required roles', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'testuser',
        roles: ['moderator'],
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin', 'moderator', 'owner');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', async () => {
      const middleware = requireRole('admin');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });

    it('should return 403 when user does not have required role', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'testuser',
        roles: ['user'],
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Required role(s): admin',
      });
    });

    it('should handle users with empty roles array', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'testuser',
        roles: [],
        tenantSlug: 'test-tenant',
      };

      const middleware = requireRole('admin');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('requirePermission', () => {
    beforeEach(() => {
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test');
    });

    it('should allow access when user has required permission', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'testuser',
        roles: ['admin'],
        tenantSlug: 'test-tenant',
      };

      vi.mocked(permissionService.getUserPermissions).mockResolvedValue([
        'users.read',
        'users.write',
      ]);

      const middleware = requirePermission('users.read');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', async () => {
      const middleware = requirePermission('users.read');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should return 403 when user does not have required permission', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'testuser',
        roles: ['user'],
        tenantSlug: 'test-tenant',
      };

      vi.mocked(permissionService.getUserPermissions).mockResolvedValue(['users.read']);

      const middleware = requirePermission('users.delete');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('should handle permission fetch errors gracefully', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'testuser',
        roles: ['user'],
        tenantSlug: 'test-tenant',
      };

      vi.mocked(permissionService.getUserPermissions).mockRejectedValue(
        new Error('Database error')
      );

      const middleware = requirePermission('users.read');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should return 500 when permission fetch fails (internal error, not access denied)
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('requireSuperAdmin', () => {
    it('should allow access for super admin from master realm', async () => {
      mockRequest.user = {
        id: 'admin-123',
        username: 'superadmin',
        roles: ['super_admin'],
        tenantSlug: 'master',
      };

      await requireSuperAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', async () => {
      await requireSuperAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should return 403 when user is not from master realm', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'admin',
        roles: ['admin'],
        tenantSlug: 'test-tenant',
      };

      await requireSuperAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('should return 403 when user does not have super_admin role', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'user',
        roles: ['admin'],
        tenantSlug: 'master',
      };

      await requireSuperAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('requireTenantOwner', () => {
    it('should allow access for tenant owner', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'owner',
        roles: ['tenant_owner'],
        tenantSlug: 'test-tenant',
      };

      await requireTenantOwner(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow access for tenant admin', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'admin',
        roles: ['admin'],
        tenantSlug: 'test-tenant',
      };

      await requireTenantOwner(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow access for super admin from master realm', async () => {
      mockRequest.user = {
        id: 'admin-123',
        username: 'superadmin',
        roles: ['super_admin'],
        tenantSlug: 'master',
      };

      await requireTenantOwner(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', async () => {
      await requireTenantOwner(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should return 403 for regular users without owner/admin roles', async () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'user',
        roles: ['user'],
        tenantSlug: 'test-tenant',
      };

      await requireTenantOwner(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });
  });
});
