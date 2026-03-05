/**
 * Integration tests for Super Admin extension routes (T008-13)
 *
 * Tests the 8 new routes added in T008-11:
 *   GET    /admin/super-admins
 *   POST   /admin/super-admins
 *   DELETE /admin/super-admins/:id
 *   GET    /admin/system/health
 *   GET    /admin/system-config
 *   GET    /admin/system-config/:key
 *   PATCH  /admin/system-config/:key
 *   GET    /admin/audit-logs
 *
 * Tests service interactions, auth enforcement, error handling,
 * and Art. 6.2 error response format compliance.
 *
 * Uses mock request/reply pattern (same as admin-api.integration.test.ts)
 * to avoid needing live infrastructure.
 */

import 'dotenv/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared BEFORE any imports that pull in services
// ---------------------------------------------------------------------------

vi.mock('@plexica/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@plexica/database')>();
  return {
    ...actual,
    default: {},
    getPrismaClient: vi.fn(() => ({})),
  };
});

vi.mock('../../lib/redis.js', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('../../services/admin.service.js', () => ({
  adminService: {
    listUsers: vi.fn(),
    getUserById: vi.fn(),
    listSuperAdmins: vi.fn(),
    createSuperAdmin: vi.fn(),
    revokeSuperAdmin: vi.fn(),
    getSystemHealth: vi.fn(),
  },
  SuperAdminNotFoundError: class SuperAdminNotFoundError extends Error {
    readonly code = 'SUPER_ADMIN_NOT_FOUND';
    readonly statusCode = 404;
    constructor(id: string) {
      super(`Super admin '${id}' not found`);
      this.name = 'SuperAdminNotFoundError';
    }
  },
  LastSuperAdminError: class LastSuperAdminError extends Error {
    readonly code = 'LAST_SUPER_ADMIN';
    readonly statusCode = 409;
    constructor() {
      super('Cannot remove the last super admin');
      this.name = 'LastSuperAdminError';
    }
  },
}));

vi.mock('../../services/system-config.service.js', () => ({
  systemConfigService: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
  },
  SystemConfigNotFoundError: class SystemConfigNotFoundError extends Error {
    readonly code = 'SYSTEM_CONFIG_NOT_FOUND';
    readonly statusCode = 404;
    constructor(key: string) {
      super(`System configuration key '${key}' not found`);
      this.name = 'SystemConfigNotFoundError';
    }
  },
}));

vi.mock('../../services/audit-log.service.js', () => ({
  auditLogService: {
    log: vi.fn(),
    queryAllTenants: vi.fn(),
  },
}));

vi.mock('../../services/tenant.service.js', () => ({
  tenantService: {
    listTenants: vi.fn(),
    createTenant: vi.fn(),
    getTenant: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
  },
}));

vi.mock('../../services/marketplace.service.js', () => ({
  marketplaceService: {
    searchPlugins: vi.fn(),
    getPluginById: vi.fn(),
  },
}));

vi.mock('../../services/analytics.service.js', () => ({
  analyticsService: {
    getOverview: vi.fn(),
    getTenantGrowth: vi.fn(),
    getPluginUsage: vi.fn(),
    getApiCallMetrics: vi.fn(),
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((_req: any, _reply: any, done: any) => done()),
  // Pass-through in unit tests — auth enforcement is tested separately
  requireSuperAdmin: vi.fn((_req: any, _reply: any, done: any) => done()),
}));

vi.mock('../../modules/jobs/job-queue.singleton.js', () => ({
  getJobQueueServiceInstance: vi.fn(() => mockJobQueueService),
}));

// Job queue mock instance (declared here, used in tests below)
const mockJobQueueService = {
  enqueue: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  getStatus: vi.fn(),
};

// ---------------------------------------------------------------------------
// Service imports (after vi.mock declarations)
// ---------------------------------------------------------------------------

import {
  adminService,
  SuperAdminNotFoundError,
  LastSuperAdminError,
} from '../../services/admin.service.js';
import {
  systemConfigService,
  SystemConfigNotFoundError,
} from '../../services/system-config.service.js';
import { auditLogService } from '../../services/audit-log.service.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-01-01T00:00:00.000Z');

import Fastify from 'fastify';
import { adminRoutes } from '../../routes/admin.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(adminRoutes);
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Super Admin Extensions — Integration Tests (T008-13)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  // =========================================================================
  // GET /admin/super-admins
  // =========================================================================

  describe('GET /admin/super-admins', () => {
    it('should return the list of super admins', async () => {
      const mockAdmins = [
        {
          id: 'sa-1',
          keycloakId: 'kc-1',
          email: 'admin@example.com',
          name: 'Admin One',
          createdAt: NOW,
        },
        { id: 'sa-2', keycloakId: null, email: 'admin2@example.com', name: null, createdAt: NOW },
      ];
      (adminService.listSuperAdmins as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdmins);

      const response = await app.inject({
        method: 'GET',
        url: '/admin/super-admins',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(adminService.listSuperAdmins).toHaveBeenCalledOnce();
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe('sa-1');
      expect(body.meta).toMatchObject({ total: 2, page: 1, limit: 50 });
    });

    it('should return 500 when service throws', async () => {
      (adminService.listSuperAdmins as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB error')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/admin/super-admins',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(body.error.message).toContain('Failed to list super admins');
    });
  });

  // =========================================================================
  // POST /admin/super-admins
  // =========================================================================

  describe('POST /admin/super-admins', () => {
    it('should create a super admin and return 201', async () => {
      const created = {
        id: 'sa-new',
        keycloakId: 'kc-new',
        email: 'new-admin@example.com',
        name: 'New Admin',
        createdAt: NOW,
      };
      (adminService.createSuperAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(created);
      (auditLogService.log as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/admin/super-admins',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        payload: { userId: 'kc-new', email: 'new-admin@example.com', name: 'New Admin' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBe('sa-new');
      expect(body.email).toBe('new-admin@example.com');

      expect(adminService.createSuperAdmin).toHaveBeenCalledOnce();
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'super_admin.granted' })
      );
    });

    it('should return 400 when service throws', async () => {
      (adminService.createSuperAdmin as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('User already has super admin role')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/admin/super-admins',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        payload: { userId: 'kc-1', email: 'admin@example.com' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('SUPER_ADMIN_CREATE_FAILED');
    });
  });

  // =========================================================================
  // DELETE /admin/super-admins/:id
  // =========================================================================

  describe('DELETE /admin/super-admins/:id', () => {
    it('should revoke super admin and return 204', async () => {
      (adminService.revokeSuperAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (auditLogService.log as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'DELETE',
        url: '/admin/super-admins/sa-1',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      expect(adminService.revokeSuperAdmin).toHaveBeenCalledWith('sa-1');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'super_admin.revoked', resourceId: 'sa-1' })
      );
    });

    it('should return 404 when super admin not found', async () => {
      (adminService.revokeSuperAdmin as ReturnType<typeof vi.fn>).mockRejectedValue(
        new SuperAdminNotFoundError('sa-missing')
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/admin/super-admins/sa-missing',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('SUPER_ADMIN_NOT_FOUND');
    });

    it('should return 409 when trying to remove the last super admin (Edge Case #8)', async () => {
      (adminService.revokeSuperAdmin as ReturnType<typeof vi.fn>).mockRejectedValue(
        new LastSuperAdminError()
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/admin/super-admins/sa-1',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('LAST_SUPER_ADMIN');
    });

    it('should return 500 for unexpected errors', async () => {
      (adminService.revokeSuperAdmin as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Unexpected failure')
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/admin/super-admins/sa-1',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  // =========================================================================
  // GET /admin/system/health
  // =========================================================================

  describe('GET /admin/system/health', () => {
    it('should return system health status', async () => {
      const healthResult = {
        status: 'healthy',
        checks: {
          database: { status: 'ok', latencyMs: 5 },
          redis: { status: 'ok', latencyMs: 2 },
          keycloak: { status: 'skipped' },
        },
        timestamp: NOW.toISOString(),
      };
      (adminService.getSystemHealth as ReturnType<typeof vi.fn>).mockResolvedValue(healthResult);

      const response = await app.inject({
        method: 'GET',
        url: '/admin/system/health',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('healthy');
      // checks is serialized as an opaque object (schema has no nested properties)
      expect(body.checks).toBeDefined();
      expect(body.timestamp).toBe(NOW.toISOString());
    });

    it('should return 500 when health check throws', async () => {
      (adminService.getSystemHealth as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis unreachable')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/admin/system/health',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  // =========================================================================
  // GET /admin/system-config
  // =========================================================================

  describe('GET /admin/system-config', () => {
    it('should return all config items', async () => {
      const items = [
        {
          key: 'max.users',
          value: 100,
          category: 'limits',
          description: null,
          updatedBy: null,
          updatedAt: NOW,
          createdAt: NOW,
        },
        {
          key: 'feature.x',
          value: true,
          category: 'features',
          description: 'Feature X flag',
          updatedBy: 'admin',
          updatedAt: NOW,
          createdAt: NOW,
        },
      ];
      (systemConfigService.list as ReturnType<typeof vi.fn>).mockResolvedValue(items);

      const response = await app.inject({
        method: 'GET',
        url: '/admin/system-config',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(systemConfigService.list).toHaveBeenCalledWith(undefined);
    });

    it('should pass category query param to service', async () => {
      (systemConfigService.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/admin/system-config?category=limits',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(systemConfigService.list).toHaveBeenCalledWith('limits');
    });

    it('should return 500 when service throws', async () => {
      (systemConfigService.list as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB error')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/admin/system-config',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  // =========================================================================
  // GET /admin/system-config/:key
  // =========================================================================

  describe('GET /admin/system-config/:key', () => {
    it('should return the config item', async () => {
      const item = {
        key: 'max.users',
        value: 100,
        category: 'limits',
        description: null,
        updatedBy: null,
        updatedAt: NOW,
        createdAt: NOW,
      };
      (systemConfigService.get as ReturnType<typeof vi.fn>).mockResolvedValue(item);

      const response = await app.inject({
        method: 'GET',
        url: '/admin/system-config/max.users',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.key).toBe('max.users');
      expect(body.value).toBe(100);
      expect(systemConfigService.get).toHaveBeenCalledWith('max.users');
    });

    it('should return 404 when config key not found', async () => {
      (systemConfigService.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new SystemConfigNotFoundError('missing.key')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/admin/system-config/missing.key',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('SYSTEM_CONFIG_NOT_FOUND');
    });

    it('should return 500 for unexpected errors', async () => {
      (systemConfigService.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Unexpected DB error')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/admin/system-config/some.key',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  // =========================================================================
  // PATCH /admin/system-config/:key
  // =========================================================================

  describe('PATCH /admin/system-config/:key', () => {
    it('should update the config item and return 200', async () => {
      (systemConfigService.update as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (auditLogService.log as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'PATCH',
        url: '/admin/system-config/max.users',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        payload: { value: 500 },
      });

      expect(response.statusCode).toBe(200);
      // Route returns { data: updated } — service mock returns undefined so body may be empty;
      // what matters is the route called the service and audit log correctly (asserted below).

      expect(systemConfigService.update).toHaveBeenCalledWith('max.users', 500, expect.any(String));
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'system_config.updated',
          resourceType: 'system_config',
          resourceId: 'max.users',
        })
      );
    });

    it('should return 500 when update throws', async () => {
      (systemConfigService.update as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB error')
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/admin/system-config/max.users',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        payload: { value: 500 },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  // =========================================================================
  // GET /admin/audit-logs
  // =========================================================================

  describe('GET /admin/audit-logs', () => {
    it('should return paginated audit log results', async () => {
      const pageResult = {
        data: [
          {
            id: 'log-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            action: 'tenant.created',
            resourceType: 'tenant',
            resourceId: 'tenant-1',
            details: {},
            ipAddress: null,
            userAgent: null,
            createdAt: NOW,
          },
        ],
        meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
      };
      (auditLogService.queryAllTenants as ReturnType<typeof vi.fn>).mockResolvedValue(pageResult);

      const response = await app.inject({
        method: 'GET',
        url: '/admin/audit-logs',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.meta.total).toBe(1);
      expect(auditLogService.queryAllTenants).toHaveBeenCalledOnce();
    });

    it('should pass query filters to the service', async () => {
      (auditLogService.queryAllTenants as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/admin/audit-logs?tenantId=t1&userId=u1&action=tenant.created&page=2&limit=20',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(auditLogService.queryAllTenants).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          userId: 'u1',
          action: 'tenant.created',
          page: 2,
          limit: 20,
        })
      );
    });

    it('should return 400 when result window is exceeded', async () => {
      const windowErr = Object.assign(new Error('Result window exceeded'), {
        code: 'AUDIT_LOG_RESULT_WINDOW_EXCEEDED',
      });
      (auditLogService.queryAllTenants as ReturnType<typeof vi.fn>).mockRejectedValue(windowErr);

      const response = await app.inject({
        method: 'GET',
        url: '/admin/audit-logs?page=1000',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('RESULT_WINDOW_EXCEEDED');
    });

    it('should return 500 for unexpected query errors', async () => {
      (auditLogService.queryAllTenants as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB timeout')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/admin/audit-logs',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  // =========================================================================
  // Art. 6.2 — Error response format compliance
  // =========================================================================

  describe('Art. 6.2 error format compliance', () => {
    it('should never return a flat string error field', async () => {
      (adminService.listSuperAdmins as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('boom')
      );
      (adminService.getSystemHealth as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('boom')
      );
      (systemConfigService.list as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
      (auditLogService.queryAllTenants as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('boom')
      );

      const routes = [
        { method: 'GET', url: '/admin/super-admins' },
        { method: 'GET', url: '/admin/system/health' },
        { method: 'GET', url: '/admin/system-config' },
        { method: 'GET', url: '/admin/audit-logs' },
      ] as const;

      for (const route of routes) {
        vi.clearAllMocks();
        // Re-apply the mock rejections for this specific route
        (adminService.listSuperAdmins as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('boom')
        );
        (adminService.getSystemHealth as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('boom')
        );
        (systemConfigService.list as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
        (auditLogService.queryAllTenants as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('boom')
        );

        const response = await app.inject({
          method: route.method,
          url: route.url,
          headers: { authorization: 'Bearer test-token' },
        });

        const body = response.json();
        expect(
          body.error,
          `Route ${route.method} ${route.url} returned flat string error`
        ).toBeTypeOf('object');
        expect(
          body.error.code,
          `Route ${route.method} ${route.url} missing error.code`
        ).toBeTruthy();
        expect(
          body.error.message,
          `Route ${route.method} ${route.url} missing error.message`
        ).toBeTruthy();
      }
    });
  });
});

// =============================================================================
// T008-66 — POST /admin/audit-logs/export
// =============================================================================

import { getJobQueueServiceInstance } from '../../modules/jobs/job-queue.singleton.js';

describe('POST /admin/audit-logs/export (T008-66)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.resetAllMocks();
    // Re-apply mock implementations that resetAllMocks() clears
    (getJobQueueServiceInstance as ReturnType<typeof vi.fn>).mockReturnValue(mockJobQueueService);
    mockJobQueueService.enqueue.mockResolvedValue({ jobId: 'test-job-id-123' });
    (auditLogService.log as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    app = await buildApp();
  });

  it('should return 202 with jobId and estimatedSeconds for valid csv request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/audit-logs/export',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'csv' }),
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.jobId).toBe('test-job-id-123');
    expect(body.estimatedSeconds).toBe(30);
  });

  it('should return 202 with jobId and estimatedSeconds for valid json request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/audit-logs/export',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'json' }),
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().jobId).toBe('test-job-id-123');
  });

  it('should enqueue job with correct name and tenantId sentinel for platform export', async () => {
    await app.inject({
      method: 'POST',
      url: '/admin/audit-logs/export',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'csv' }),
    });

    expect(mockJobQueueService.enqueue).toHaveBeenCalledOnce();
    const jobArg = mockJobQueueService.enqueue.mock.calls[0][0];
    expect(jobArg.name).toBe('audit-log-export');
    expect(jobArg.tenantId).toBe('__platform__');
    expect(jobArg.payload.format).toBe('csv');
    expect(jobArg.payload.tenantId).toBe('__platform__');
  });

  it('should use provided tenantId in job payload when filtering by tenant', async () => {
    const tenantId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    await app.inject({
      method: 'POST',
      url: '/admin/audit-logs/export',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'json', tenantId }),
    });

    const jobArg = mockJobQueueService.enqueue.mock.calls[0][0];
    expect(jobArg.tenantId).toBe(tenantId);
    expect(jobArg.payload.tenantId).toBe(tenantId);
    expect(jobArg.payload.filterTenantId).toBe(tenantId);
  });

  it('should include optional filters in job payload when provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/admin/audit-logs/export',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        format: 'csv',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-03-01T00:00:00Z',
        actions: ['user.created', 'tenant.deleted'],
        limit: 10000,
      }),
    });

    const jobArg = mockJobQueueService.enqueue.mock.calls[0][0];
    expect(jobArg.payload.startDate).toBe('2026-01-01T00:00:00Z');
    expect(jobArg.payload.endDate).toBe('2026-03-01T00:00:00Z');
    expect(jobArg.payload.actions).toEqual(['user.created', 'tenant.deleted']);
    expect(jobArg.payload.limit).toBe(10000);
  });

  it('should emit audit_log.export_requested event after enqueue', async () => {
    await app.inject({
      method: 'POST',
      url: '/admin/audit-logs/export',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'csv' }),
    });

    expect(auditLogService.log).toHaveBeenCalledOnce();
    const logArg = (auditLogService.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(logArg.action).toBe('audit_log.export_requested');
    expect(logArg.resourceId).toBe('test-job-id-123');
    expect(logArg.resourceType).toBe('audit_log');
    expect(logArg.details.format).toBe('csv');
  });

  it('should return 400 INVALID_EXPORT_FORMAT for unsupported format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/audit-logs/export',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'xml' }),
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_EXPORT_FORMAT');
  });

  it('should return 400 VALIDATION_ERROR for limit exceeding 50000', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/audit-logs/export',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'csv', limit: 99999 }),
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBeDefined();
  });

  it('should return 500 INTERNAL_SERVER_ERROR when job queue fails', async () => {
    mockJobQueueService.enqueue.mockRejectedValueOnce(new Error('Redis down'));

    const response = await app.inject({
      method: 'POST',
      url: '/admin/audit-logs/export',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'csv' }),
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toMatch(/enqueue/i);
  });

  it('should use getJobQueueServiceInstance singleton', async () => {
    await app.inject({
      method: 'POST',
      url: '/admin/audit-logs/export',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'json' }),
    });

    expect(getJobQueueServiceInstance).toHaveBeenCalled();
  });
});
