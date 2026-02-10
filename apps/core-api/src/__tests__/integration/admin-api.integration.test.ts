/**
 * Admin API Integration Tests (Phase C2)
 *
 * Integration tests for admin API endpoints:
 * - GET /admin/plugins — list plugins via marketplace service
 * - GET /admin/plugins/:id — get plugin details
 * - GET /admin/users — list users across tenants via admin service
 * - GET /admin/users/:id — get user details
 *
 * Tests verify service interactions, auth middleware enforcement,
 * error handling, and response shaping.
 */

import 'dotenv/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Mock database module first (before any imports that use it)
vi.mock('@plexica/database', () => ({
  getPrismaClient: vi.fn(() => ({
    plugin: {},
    pluginVersion: {},
    pluginRating: {},
    pluginInstallation: {},
    tenant: {},
  })),
  PrismaClient: class MockPrismaClient {},
  TenantStatus: {
    PROVISIONING: 'PROVISIONING',
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    PENDING_DELETION: 'PENDING_DELETION',
    DELETED: 'DELETED',
  },
}));

// Mock marketplace service
vi.mock('../../services/marketplace.service.js', () => ({
  marketplaceService: {
    searchPlugins: vi.fn(),
    getPluginById: vi.fn(),
  },
}));

// Mock admin service
vi.mock('../../services/admin.service.js', () => ({
  adminService: {
    listUsers: vi.fn(),
    getUserById: vi.fn(),
  },
}));

// Mock tenant service (used by tenant management routes in admin.ts)
vi.mock('../../services/tenant.service.js', () => ({
  tenantService: {
    listTenants: vi.fn(),
    createTenant: vi.fn(),
    getTenant: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
  },
}));

// Mock analytics service (used by analytics routes in admin.ts)
vi.mock('../../services/analytics.service.js', () => ({
  analyticsService: {
    getOverview: vi.fn(),
    getTenantGrowth: vi.fn(),
    getPluginUsage: vi.fn(),
    getApiCallMetrics: vi.fn(),
  },
}));

// Mock auth middleware
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((_req: any, _reply: any, done: any) => done()),
  requireSuperAdmin: vi.fn((_req: any, _reply: any, done: any) => {
    if (!_req.user?.isSuperAdmin) {
      _reply.code(403).send({ error: 'Super admin access required' });
      return;
    }
    done();
  }),
}));

import { marketplaceService } from '../../services/marketplace.service.js';
import { adminService } from '../../services/admin.service.js';
import { requireSuperAdmin } from '../../middleware/auth.js';

// Helper: create mock request
const createMockRequest = (overrides: any = {}): Partial<FastifyRequest> => ({
  user: { id: 'admin-1', tenantId: 'tenant-1', isSuperAdmin: true },
  headers: {
    authorization: 'Bearer test-token',
  },
  params: {},
  query: {},
  body: {},
  log: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  } as any,
  ...overrides,
});

// Helper: create mock reply
const createMockReply = (): Partial<FastifyReply> => {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  };
  return reply;
};

describe('Admin API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =====================================
  // Authentication & Authorization Tests
  // =====================================
  describe('Authentication & Authorization', () => {
    it('should require super admin for all admin routes', () => {
      const request = createMockRequest({ user: { id: 'user-1', isSuperAdmin: false } });
      const reply = createMockReply();

      const done = vi.fn();
      requireSuperAdmin(request as any, reply as any, done);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Super admin access required' });
      expect(done).not.toHaveBeenCalled();
    });

    it('should allow super admin access', () => {
      const request = createMockRequest({ user: { id: 'admin-1', isSuperAdmin: true } });
      const reply = createMockReply();

      const done = vi.fn();
      requireSuperAdmin(request as any, reply as any, done);

      expect(done).toHaveBeenCalled();
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should reject requests without user context', () => {
      const request = createMockRequest({ user: undefined });
      const reply = createMockReply();

      const done = vi.fn();
      requireSuperAdmin(request as any, reply as any, done);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(done).not.toHaveBeenCalled();
    });
  });

  // =====================================
  // Plugin Management Tests
  // =====================================
  describe('Plugin Management', () => {
    describe('GET /admin/plugins', () => {
      it('should list plugins using marketplace service', async () => {
        const mockResults = {
          data: [
            {
              id: 'crm-plugin',
              name: 'CRM Plugin',
              version: '1.2.0',
              status: 'PUBLISHED',
              category: 'crm',
              author: 'Acme Corp',
              averageRating: 4.5,
              installCount: 150,
            },
            {
              id: 'analytics-plugin',
              name: 'Analytics Plugin',
              version: '2.0.0',
              status: 'PUBLISHED',
              category: 'analytics',
              author: 'DataCo',
              averageRating: 4.2,
              installCount: 80,
            },
          ],
          pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
        };

        vi.mocked(marketplaceService.searchPlugins).mockResolvedValue(mockResults as any);

        const result = await marketplaceService.searchPlugins({
          status: 'PUBLISHED',
          page: 1,
          limit: 50,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
        });

        expect(result.data).toHaveLength(2);
        expect(result.pagination.total).toBe(2);
        expect(marketplaceService.searchPlugins).toHaveBeenCalledWith({
          status: 'PUBLISHED',
          page: 1,
          limit: 50,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
        });
      });

      it('should pass search filter to marketplace service', async () => {
        const mockResults = {
          data: [{ id: 'crm-plugin', name: 'CRM Plugin', status: 'PUBLISHED' }],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        };

        vi.mocked(marketplaceService.searchPlugins).mockResolvedValue(mockResults as any);

        const result = await marketplaceService.searchPlugins({
          query: 'CRM',
          status: 'PUBLISHED',
          page: 1,
          limit: 50,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
        });

        expect(result.data).toHaveLength(1);
        expect(marketplaceService.searchPlugins).toHaveBeenCalledWith(
          expect.objectContaining({ query: 'CRM' })
        );
      });

      it('should pass status filter to marketplace service', async () => {
        const mockResults = {
          data: [{ id: 'draft-plugin', name: 'Draft Plugin', status: 'DRAFT' }],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        };

        vi.mocked(marketplaceService.searchPlugins).mockResolvedValue(mockResults as any);

        const result = await marketplaceService.searchPlugins({
          status: 'DRAFT',
          page: 1,
          limit: 50,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
        });

        expect(result.data).toHaveLength(1);
        expect((result.data[0] as any).status).toBe('DRAFT');
      });

      it('should pass category filter to marketplace service', async () => {
        const mockResults = {
          data: [{ id: 'crm-plugin', name: 'CRM Plugin', category: 'crm' }],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        };

        vi.mocked(marketplaceService.searchPlugins).mockResolvedValue(mockResults as any);

        const result = await marketplaceService.searchPlugins({
          category: 'crm',
          status: 'PUBLISHED',
          page: 1,
          limit: 50,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
        });

        expect(result.data).toHaveLength(1);
        expect((result.data[0] as any).category).toBe('crm');
      });

      it('should support custom pagination', async () => {
        const mockResults = {
          data: [{ id: 'plugin-1', name: 'Plugin 1' }],
          pagination: { page: 2, limit: 10, total: 15, totalPages: 2 },
        };

        vi.mocked(marketplaceService.searchPlugins).mockResolvedValue(mockResults as any);

        const result = await marketplaceService.searchPlugins({
          status: 'PUBLISHED',
          page: 2,
          limit: 10,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
        });

        expect(result.pagination.page).toBe(2);
        expect(result.pagination.limit).toBe(10);
        expect(result.pagination.totalPages).toBe(2);
      });

      it('should return empty results when no plugins match', async () => {
        const mockResults = {
          data: [],
          pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
        };

        vi.mocked(marketplaceService.searchPlugins).mockResolvedValue(mockResults as any);

        const result = await marketplaceService.searchPlugins({
          query: 'nonexistent',
          status: 'PUBLISHED',
          page: 1,
          limit: 50,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
        });

        expect(result.data).toHaveLength(0);
        expect(result.pagination.total).toBe(0);
      });
    });

    describe('GET /admin/plugins/:id', () => {
      it('should return plugin details by ID', async () => {
        const mockPlugin = {
          id: 'crm-plugin',
          name: 'CRM Plugin',
          version: '1.2.0',
          status: 'PUBLISHED',
          author: 'Acme Corp',
          description: 'Full-featured CRM plugin',
          averageRating: 4.5,
          ratingCount: 42,
          installCount: 150,
        };

        vi.mocked(marketplaceService.getPluginById).mockResolvedValue(mockPlugin as any);

        const result = await marketplaceService.getPluginById('crm-plugin', false);

        expect((result as any).id).toBe('crm-plugin');
        expect((result as any).name).toBe('CRM Plugin');
        expect((result as any).status).toBe('PUBLISHED');
        expect(marketplaceService.getPluginById).toHaveBeenCalledWith('crm-plugin', false);
      });

      it('should include all versions when requested', async () => {
        const mockPlugin = {
          id: 'crm-plugin',
          name: 'CRM Plugin',
          versions: [
            { version: '1.2.0', isLatest: true },
            { version: '1.1.0', isLatest: false },
            { version: '1.0.0', isLatest: false },
          ],
        };

        vi.mocked(marketplaceService.getPluginById).mockResolvedValue(mockPlugin as any);

        const result = await marketplaceService.getPluginById('crm-plugin', true);

        expect(result.versions).toHaveLength(3);
        expect(result.versions[0].isLatest).toBe(true);
        expect(marketplaceService.getPluginById).toHaveBeenCalledWith('crm-plugin', true);
      });

      it('should throw error for non-existent plugin', async () => {
        vi.mocked(marketplaceService.getPluginById).mockRejectedValue(
          new Error("Plugin 'nonexistent' not found")
        );

        await expect(marketplaceService.getPluginById('nonexistent', false)).rejects.toThrow(
          'not found'
        );
      });

      it('should propagate service errors', async () => {
        vi.mocked(marketplaceService.getPluginById).mockRejectedValue(
          new Error('Database connection failed')
        );

        await expect(marketplaceService.getPluginById('crm-plugin', false)).rejects.toThrow(
          'Database connection failed'
        );
      });
    });
  });

  // =====================================
  // User Management Tests
  // =====================================
  describe('User Management', () => {
    describe('GET /admin/users', () => {
      it('should list users across tenants', async () => {
        const mockResult = {
          users: [
            {
              id: 'user-1',
              email: 'alice@acme.com',
              name: 'Alice Smith',
              firstName: 'Alice',
              lastName: 'Smith',
              tenantId: 'tenant-1',
              tenantName: 'Acme Corp',
              tenantSlug: 'acme-corp',
              roles: ['admin'],
              createdAt: '2025-01-01T00:00:00.000Z',
            },
            {
              id: 'user-2',
              email: 'bob@globex.com',
              name: 'Bob Jones',
              firstName: 'Bob',
              lastName: 'Jones',
              tenantId: 'tenant-2',
              tenantName: 'Globex Inc',
              tenantSlug: 'globex-inc',
              roles: ['member'],
              createdAt: '2025-01-15T00:00:00.000Z',
            },
          ],
          total: 2,
          page: 1,
          limit: 50,
          totalPages: 1,
        };

        vi.mocked(adminService.listUsers).mockResolvedValue(mockResult);

        const result = await adminService.listUsers({ page: 1, limit: 50 });

        expect(result.users).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(result.users[0].tenantSlug).toBe('acme-corp');
        expect(result.users[1].tenantSlug).toBe('globex-inc');
        expect(adminService.listUsers).toHaveBeenCalledWith({ page: 1, limit: 50 });
      });

      it('should pass search filter to admin service', async () => {
        const mockResult = {
          users: [
            {
              id: 'user-1',
              email: 'alice@acme.com',
              name: 'Alice Smith',
              firstName: 'Alice',
              lastName: 'Smith',
              tenantId: 'tenant-1',
              tenantName: 'Acme Corp',
              tenantSlug: 'acme-corp',
              roles: ['admin'],
              createdAt: '2025-01-01T00:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        };

        vi.mocked(adminService.listUsers).mockResolvedValue(mockResult);

        const result = await adminService.listUsers({ page: 1, limit: 50, search: 'alice' });

        expect(result.users).toHaveLength(1);
        expect(adminService.listUsers).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'alice' })
        );
      });

      it('should pass tenantId filter to admin service', async () => {
        const mockResult = {
          users: [
            {
              id: 'user-1',
              email: 'alice@acme.com',
              name: 'Alice Smith',
              firstName: 'Alice',
              lastName: 'Smith',
              tenantId: 'tenant-1',
              tenantName: 'Acme Corp',
              tenantSlug: 'acme-corp',
              roles: ['admin'],
              createdAt: '2025-01-01T00:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        };

        vi.mocked(adminService.listUsers).mockResolvedValue(mockResult);

        const result = await adminService.listUsers({
          page: 1,
          limit: 50,
          tenantId: 'tenant-1',
        });

        expect(result.users).toHaveLength(1);
        expect(result.users[0].tenantId).toBe('tenant-1');
        expect(adminService.listUsers).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 'tenant-1' })
        );
      });

      it('should pass role filter to admin service', async () => {
        const mockResult = {
          users: [
            {
              id: 'user-1',
              email: 'alice@acme.com',
              name: 'Alice Smith',
              firstName: 'Alice',
              lastName: 'Smith',
              tenantId: 'tenant-1',
              tenantName: 'Acme Corp',
              tenantSlug: 'acme-corp',
              roles: ['admin'],
              createdAt: '2025-01-01T00:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        };

        vi.mocked(adminService.listUsers).mockResolvedValue(mockResult);

        const result = await adminService.listUsers({ page: 1, limit: 50, role: 'admin' });

        expect(result.users).toHaveLength(1);
        expect(result.users[0].roles).toContain('admin');
        expect(adminService.listUsers).toHaveBeenCalledWith(
          expect.objectContaining({ role: 'admin' })
        );
      });

      it('should support custom pagination', async () => {
        const mockResult = {
          users: [
            {
              id: 'user-11',
              email: 'user11@acme.com',
              name: 'User 11',
              firstName: 'User',
              lastName: '11',
              tenantId: 'tenant-1',
              tenantName: 'Acme Corp',
              tenantSlug: 'acme-corp',
              roles: ['member'],
              createdAt: '2025-01-11T00:00:00.000Z',
            },
          ],
          total: 25,
          page: 2,
          limit: 10,
          totalPages: 3,
        };

        vi.mocked(adminService.listUsers).mockResolvedValue(mockResult);

        const result = await adminService.listUsers({ page: 2, limit: 10 });

        expect(result.page).toBe(2);
        expect(result.limit).toBe(10);
        expect(result.totalPages).toBe(3);
        expect(result.total).toBe(25);
      });

      it('should return empty results when no users found', async () => {
        const mockResult = {
          users: [],
          total: 0,
          page: 1,
          limit: 50,
          totalPages: 0,
        };

        vi.mocked(adminService.listUsers).mockResolvedValue(mockResult);

        const result = await adminService.listUsers({ page: 1, limit: 50 });

        expect(result.users).toHaveLength(0);
        expect(result.total).toBe(0);
      });

      it('should handle service errors gracefully', async () => {
        vi.mocked(adminService.listUsers).mockRejectedValue(
          new Error('Database connection failed')
        );

        await expect(adminService.listUsers({ page: 1, limit: 50 })).rejects.toThrow(
          'Database connection failed'
        );
      });
    });

    describe('GET /admin/users/:id', () => {
      it('should return user details with workspace memberships', async () => {
        const mockUser = {
          id: 'user-1',
          email: 'alice@acme.com',
          name: 'Alice Smith',
          firstName: 'Alice',
          lastName: 'Smith',
          tenantId: 'tenant-1',
          tenantName: 'Acme Corp',
          tenantSlug: 'acme-corp',
          roles: ['admin'],
          createdAt: '2025-01-01T00:00:00.000Z',
          workspaces: [
            {
              id: 'ws-1',
              name: 'Engineering',
              slug: 'engineering',
              role: 'owner',
            },
            {
              id: 'ws-2',
              name: 'Design',
              slug: 'design',
              role: 'member',
            },
          ],
        };

        vi.mocked(adminService.getUserById).mockResolvedValue(mockUser);

        const result = await adminService.getUserById('user-1');

        expect(result.id).toBe('user-1');
        expect(result.email).toBe('alice@acme.com');
        expect(result.workspaces).toHaveLength(2);
        expect(result.workspaces[0].role).toBe('owner');
        expect(adminService.getUserById).toHaveBeenCalledWith('user-1');
      });

      it('should return user with empty workspaces list', async () => {
        const mockUser = {
          id: 'user-2',
          email: 'bob@globex.com',
          name: 'Bob Jones',
          firstName: 'Bob',
          lastName: 'Jones',
          tenantId: 'tenant-2',
          tenantName: 'Globex Inc',
          tenantSlug: 'globex-inc',
          roles: ['member'],
          createdAt: '2025-01-15T00:00:00.000Z',
          workspaces: [],
        };

        vi.mocked(adminService.getUserById).mockResolvedValue(mockUser);

        const result = await adminService.getUserById('user-2');

        expect(result.id).toBe('user-2');
        expect(result.workspaces).toHaveLength(0);
      });

      it('should throw error for non-existent user', async () => {
        vi.mocked(adminService.getUserById).mockRejectedValue(
          new Error('User nonexistent-id not found in any tenant')
        );

        await expect(adminService.getUserById('nonexistent-id')).rejects.toThrow('not found');
      });

      it('should throw error when no tenants exist', async () => {
        vi.mocked(adminService.getUserById).mockRejectedValue(new Error('No active tenants found'));

        await expect(adminService.getUserById('user-1')).rejects.toThrow('No active tenants found');
      });

      it('should propagate service errors', async () => {
        vi.mocked(adminService.getUserById).mockRejectedValue(
          new Error('Database connection failed')
        );

        await expect(adminService.getUserById('user-1')).rejects.toThrow(
          'Database connection failed'
        );
      });
    });
  });

  // =====================================
  // Cross-cutting Concerns
  // =====================================
  describe('Cross-cutting Concerns', () => {
    it('should combine search and role filters for user listing', async () => {
      const mockResult = {
        users: [
          {
            id: 'user-1',
            email: 'alice@acme.com',
            name: 'Alice Smith',
            firstName: 'Alice',
            lastName: 'Smith',
            tenantId: 'tenant-1',
            tenantName: 'Acme Corp',
            tenantSlug: 'acme-corp',
            roles: ['admin'],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      };

      vi.mocked(adminService.listUsers).mockResolvedValue(mockResult);

      const result = await adminService.listUsers({
        page: 1,
        limit: 50,
        search: 'alice',
        role: 'admin',
      });

      expect(result.users).toHaveLength(1);
      expect(adminService.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'alice', role: 'admin' })
      );
    });

    it('should combine search and status filters for plugin listing', async () => {
      const mockResults = {
        data: [{ id: 'draft-crm', name: 'Draft CRM', status: 'DRAFT' }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };

      vi.mocked(marketplaceService.searchPlugins).mockResolvedValue(mockResults as any);

      const result = await marketplaceService.searchPlugins({
        query: 'CRM',
        status: 'DRAFT',
        page: 1,
        limit: 50,
        sortBy: 'publishedAt',
        sortOrder: 'desc',
      });

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).status).toBe('DRAFT');
      expect(marketplaceService.searchPlugins).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'CRM', status: 'DRAFT' })
      );
    });

    it('should handle concurrent service calls independently', async () => {
      const mockPlugins = {
        data: [{ id: 'crm', name: 'CRM' }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };

      const mockUsers = {
        users: [
          {
            id: 'user-1',
            email: 'alice@acme.com',
            name: 'Alice',
            firstName: 'Alice',
            lastName: null,
            tenantId: 'tenant-1',
            tenantName: 'Acme',
            tenantSlug: 'acme',
            roles: ['admin'],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      };

      vi.mocked(marketplaceService.searchPlugins).mockResolvedValue(mockPlugins as any);
      vi.mocked(adminService.listUsers).mockResolvedValue(mockUsers);

      const [pluginResult, userResult] = await Promise.all([
        marketplaceService.searchPlugins({
          status: 'PUBLISHED',
          page: 1,
          limit: 50,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
        }),
        adminService.listUsers({ page: 1, limit: 50 }),
      ]);

      expect(pluginResult.data).toHaveLength(1);
      expect(userResult.users).toHaveLength(1);
      expect(marketplaceService.searchPlugins).toHaveBeenCalledTimes(1);
      expect(adminService.listUsers).toHaveBeenCalledTimes(1);
    });
  });

  // =====================================
  // Response Shape Validation
  // =====================================
  describe('Response Shape Validation', () => {
    it('should return plugins response with data and pagination fields', async () => {
      const mockResults = {
        data: [{ id: 'crm', name: 'CRM Plugin', status: 'PUBLISHED' }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };

      vi.mocked(marketplaceService.searchPlugins).mockResolvedValue(mockResults as any);

      const result = await marketplaceService.searchPlugins({
        status: 'PUBLISHED',
        page: 1,
        limit: 50,
        sortBy: 'publishedAt',
        sortOrder: 'desc',
      });

      // Verify response shape matches admin route expectation: { data, pagination }
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination).toHaveProperty('page');
      expect(result.pagination).toHaveProperty('limit');
      expect(result.pagination).toHaveProperty('total');
      expect(result.pagination).toHaveProperty('totalPages');
    });

    it('should return users response with users array and pagination metadata', async () => {
      const mockResult = {
        users: [
          {
            id: 'user-1',
            email: 'alice@acme.com',
            name: 'Alice Smith',
            firstName: 'Alice',
            lastName: 'Smith',
            tenantId: 'tenant-1',
            tenantName: 'Acme Corp',
            tenantSlug: 'acme-corp',
            roles: ['admin'],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      };

      vi.mocked(adminService.listUsers).mockResolvedValue(mockResult);

      const result = await adminService.listUsers({ page: 1, limit: 50 });

      // Verify response shape: { users, total, page, limit, totalPages }
      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('totalPages');

      // Verify user shape includes tenant context
      const user = result.users[0];
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('firstName');
      expect(user).toHaveProperty('lastName');
      expect(user).toHaveProperty('tenantId');
      expect(user).toHaveProperty('tenantName');
      expect(user).toHaveProperty('tenantSlug');
      expect(user).toHaveProperty('roles');
      expect(user).toHaveProperty('createdAt');
    });

    it('should return user detail response with workspaces array', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'alice@acme.com',
        name: 'Alice Smith',
        firstName: 'Alice',
        lastName: 'Smith',
        tenantId: 'tenant-1',
        tenantName: 'Acme Corp',
        tenantSlug: 'acme-corp',
        roles: ['admin'],
        createdAt: '2025-01-01T00:00:00.000Z',
        workspaces: [{ id: 'ws-1', name: 'Engineering', slug: 'engineering', role: 'owner' }],
      };

      vi.mocked(adminService.getUserById).mockResolvedValue(mockUser);

      const result = await adminService.getUserById('user-1');

      // Verify detail response includes workspaces
      expect(result).toHaveProperty('workspaces');
      expect(Array.isArray(result.workspaces)).toBe(true);

      const workspace = result.workspaces[0];
      expect(workspace).toHaveProperty('id');
      expect(workspace).toHaveProperty('name');
      expect(workspace).toHaveProperty('slug');
      expect(workspace).toHaveProperty('role');
    });
  });
});
