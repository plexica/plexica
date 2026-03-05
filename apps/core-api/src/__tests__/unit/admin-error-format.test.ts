// apps/core-api/src/__tests__/unit/admin-error-format.test.ts
// T008-08 — Unit tests verifying Art. 6.2 error format compliance in admin.ts
//
// Each test hits a route that is known to return an error and asserts that the
// response body matches the constitutionally-mandated shape:
//   { error: { code: string, message: string, details?: object } }
//
// Tests use a minimal Fastify instance (NOT buildTestApp) to avoid the Redis
// connection that buildTestApp initiates at module load time before mocks take
// effect. Only adminRoutes (from admin.ts) is registered.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock all external dependencies before importing adminRoutes ───────────────

vi.mock('@plexica/database', () => ({
  getPrismaClient: vi.fn(() => ({})),
  PrismaClient: class MockPrismaClient {},
  TenantStatus: {
    PROVISIONING: 'PROVISIONING',
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    PENDING_DELETION: 'PENDING_DELETION',
    DELETED: 'DELETED',
  },
}));

vi.mock('../../lib/db.js', () => ({
  db: {
    tenant: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    tenantPlugin: { findMany: vi.fn() },
    superAdmin: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    systemConfig: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn(),
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock all services that admin.ts uses
vi.mock('../../services/tenant.service.js', () => ({
  tenantService: {
    listTenants: vi.fn(),
    createTenant: vi.fn(),
    getTenant: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
    suspendTenant: vi.fn(),
    activateTenant: vi.fn(),
  },
}));

vi.mock('../../services/keycloak.service.js', () => ({
  keycloakService: {
    getAdminToken: vi.fn(),
    inviteUser: vi.fn(),
    resendInvitation: vi.fn(),
    getUserByEmail: vi.fn(),
    listUsers: vi.fn(),
    sendRequiredActionEmail: vi.fn(),
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

vi.mock('../../services/marketplace.service.js', () => ({
  marketplaceService: {
    searchPlugins: vi.fn(),
    getPluginById: vi.fn(),
    publishPlugin: vi.fn(),
    updatePluginMetadata: vi.fn(),
  },
}));

vi.mock('../../services/admin.service.js', () => ({
  adminService: {
    listUsers: vi.fn(),
    getUserById: vi.fn(),
    getSuperAdminById: vi.fn(),
    createSuperAdmin: vi.fn(),
    revokeSuperAdmin: vi.fn(),
    getSystemHealth: vi.fn(),
  },
}));

vi.mock('../../services/plugin.service.js', () => ({
  pluginRegistryService: {
    listPlugins: vi.fn(),
    getPluginById: vi.fn(),
    getPlugin: vi.fn(),
    createPlugin: vi.fn(),
    updatePlugin: vi.fn(),
    deletePlugin: vi.fn(),
    getPluginInstalls: vi.fn(),
  },
}));

vi.mock('../../services/system-config.service.js', () => ({
  systemConfigService: {
    get: vi.fn(),
    set: vi.fn(),
    list: vi.fn(),
    getBoolean: vi.fn(),
    getNumber: vi.fn(),
  },
}));

vi.mock('../../services/audit-log.service.js', () => ({
  auditLogService: {
    log: vi.fn(),
    query: vi.fn(),
    queryForTenant: vi.fn(),
  },
}));

vi.mock('../../services/service-registry.service.js', () => ({
  ServiceRegistryService: class MockServiceRegistry {
    constructor() {}
  },
}));

vi.mock('../../services/plugin-api-gateway.service.js', () => ({
  PluginApiGateway: class MockPluginApiGateway {
    constructor() {}
  },
}));

vi.mock('../../services/shared-data.service.js', () => ({
  SharedDataService: class MockSharedDataService {
    constructor() {}
  },
}));

vi.mock('../../services/dependency-resolution.service.js', () => ({
  DependencyResolutionService: class MockDependencyResolutionService {
    constructor() {}
  },
}));

// Mock @fastify/rate-limit as a no-op plugin
vi.mock('@fastify/rate-limit', () => ({
  default: async (_instance: any, _opts: any) => {
    // no-op
  },
}));

vi.mock('@fastify/helmet', () => ({
  default: async (_instance: any, _opts: any) => {
    // no-op
  },
}));

vi.mock('@fastify/cors', () => ({
  default: async (_instance: any, _opts: any) => {
    // no-op
  },
}));

// Auth middleware — passes all requests as super-admin
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((_req: any, _reply: any, done: any) => done()),
  requireSuperAdmin: vi.fn((_req: any, _reply: any, done: any) => done()),
  requireRole: vi.fn(() => (_req: any, _reply: any, done: any) => done()),
}));

vi.mock('../../lib/tenant-sanitize.js', () => ({
  sanitizeTenant: vi.fn((t: any) => t),
}));

// ─── Import minimal Fastify + adminRoutes AFTER mocks are registered ──────────

import fastify, { type FastifyInstance } from 'fastify';
import { adminRoutes } from '../../routes/admin.js';
import { tenantService } from '../../services/tenant.service.js';
import { marketplaceService } from '../../services/marketplace.service.js';
import { adminService } from '../../services/admin.service.js';
import { pluginRegistryService } from '../../services/plugin.service.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Assert that a response body matches the Art. 6.2 error envelope. */
function assertArt62Shape(
  body: unknown
): asserts body is { error: { code: string; message: string } } {
  expect(body).toHaveProperty('error');
  expect(typeof (body as any).error).toBe('object');
  expect(typeof (body as any).error.code).toBe('string');
  expect((body as any).error.code).toMatch(/^[A-Z][A-Z0-9_]+$/); // SCREAMING_SNAKE_CASE
  expect(typeof (body as any).error.message).toBe('string');
  expect((body as any).error.message.length).toBeGreaterThan(0);
  // Must NOT be the old flat string shape { error: "some string" }
  expect(typeof (body as any).error).not.toBe('string');
}

const SUPER_ADMIN_TOKEN = 'Bearer test-super-admin-token';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('admin.ts — Art. 6.2 error format compliance', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Build a minimal Fastify instance — no Redis, no full buildTestApp()
    app = fastify({ logger: false });
    // Register only adminRoutes (avoids all the real service connections)
    await app.register(adminRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Tenant routes ──────────────────────────────────────────────────────────

  describe('GET /api/admin/tenants/:id — TENANT_NOT_FOUND (404)', () => {
    it('should return { error: { code, message } } when tenant is not found', async () => {
      (tenantService.getTenant as any).mockRejectedValue(new Error('Tenant not found'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants/nonexistent-id',
        headers: { authorization: SUPER_ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('TENANT_NOT_FOUND');
    });
  });

  describe('POST /api/admin/tenants — SLUG_CONFLICT (409)', () => {
    it('should return { error: { code, message } } when slug already exists', async () => {
      (tenantService.createTenant as any).mockRejectedValue(
        new Error('Tenant with slug already exists')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/tenants',
        headers: { authorization: SUPER_ADMIN_TOKEN, 'content-type': 'application/json' },
        payload: {
          name: 'Test Corp',
          slug: 'test-corp',
          adminEmail: 'admin@test.com',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('SLUG_CONFLICT');
    });
  });

  describe('POST /api/admin/tenants/:id/suspend — TENANT_NOT_FOUND (404)', () => {
    it('should return { error: { code, message } } when tenant to suspend is not found', async () => {
      (tenantService.suspendTenant as any).mockRejectedValue(new Error('Tenant not found'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/tenants/nonexistent-id/suspend',
        headers: { authorization: SUPER_ADMIN_TOKEN, 'content-type': 'application/json' },
        payload: { reason: 'billing' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('TENANT_NOT_FOUND');
    });
  });

  describe('POST /api/admin/tenants/:id/suspend — INVALID_TENANT_STATE (409)', () => {
    it('should return { error: { code, message } } when tenant state transition is invalid', async () => {
      (tenantService.suspendTenant as any).mockRejectedValue(
        new Error('Cannot suspend tenant with status: SUSPENDED')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/tenants/tenant-1/suspend',
        headers: { authorization: SUPER_ADMIN_TOKEN, 'content-type': 'application/json' },
        payload: { reason: 'billing' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('INVALID_TENANT_STATE');
    });
  });

  describe('POST /api/admin/tenants/:id/activate — TENANT_NOT_FOUND (404)', () => {
    it('should return { error: { code, message } } when tenant to activate is not found', async () => {
      (tenantService.activateTenant as any).mockRejectedValue(new Error('Tenant not found'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/tenants/nonexistent-id/activate',
        headers: { authorization: SUPER_ADMIN_TOKEN, 'content-type': 'application/json' },
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('TENANT_NOT_FOUND');
    });
  });

  describe('POST /api/admin/tenants/:id/activate — INVALID_STATUS_TRANSITION (400)', () => {
    it('should return { error: { code, message } } when status transition is invalid', async () => {
      (tenantService.activateTenant as any).mockRejectedValue(
        new Error('Cannot activate tenant with status: ACTIVE')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/tenants/tenant-1/activate',
        headers: { authorization: SUPER_ADMIN_TOKEN, 'content-type': 'application/json' },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  // ── Plugin routes ──────────────────────────────────────────────────────────

  describe('GET /api/admin/plugins/:id — PLUGIN_NOT_FOUND (404)', () => {
    it('should return { error: { code, message } } when plugin is not found', async () => {
      (marketplaceService.getPluginById as any).mockRejectedValue(new Error('Plugin not found'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/plugins/nonexistent-plugin',
        headers: { authorization: SUPER_ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('PLUGIN_NOT_FOUND');
    });
  });

  describe('PATCH /api/admin/plugins/:id — PLUGIN_NOT_FOUND (404)', () => {
    it('should return { error: { code, message } } when plugin to update is not found', async () => {
      (marketplaceService.updatePluginMetadata as any).mockRejectedValue(
        new Error('Plugin not found')
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/admin/plugins/nonexistent-plugin',
        headers: { authorization: SUPER_ADMIN_TOKEN, 'content-type': 'application/json' },
        payload: { description: 'updated' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('PLUGIN_NOT_FOUND');
    });
  });

  describe('DELETE /api/admin/plugins/:id — PLUGIN_NOT_FOUND (404)', () => {
    it('should return { error: { code, message } } when plugin to delete is not found', async () => {
      (pluginRegistryService.deletePlugin as any).mockRejectedValue(new Error('Plugin not found'));

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/admin/plugins/nonexistent-plugin',
        headers: { authorization: SUPER_ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('PLUGIN_NOT_FOUND');
    });
  });

  describe('DELETE /api/admin/plugins/:id — PLUGIN_DELETE_CONFLICT (409)', () => {
    it('should return { error: { code, message } } when plugin has active installations', async () => {
      (pluginRegistryService.deletePlugin as any).mockRejectedValue(
        new Error('Cannot delete plugin with active installations')
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/admin/plugins/active-plugin',
        headers: { authorization: SUPER_ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('PLUGIN_DELETE_CONFLICT');
    });
  });

  // ── User routes ────────────────────────────────────────────────────────────

  describe('GET /api/admin/users/:id — USER_NOT_FOUND (404)', () => {
    it('should return { error: { code, message } } when user is not found', async () => {
      (adminService.getUserById as any).mockRejectedValue(new Error('User not found'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users/nonexistent-user',
        headers: { authorization: SUPER_ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      assertArt62Shape(body);
      expect(body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  // ── Global invariant: no flat { error: string } shape anywhere ─────────────

  describe('Art. 6.2 invariant — no flat { error: string } shape', () => {
    it('should never return a flat error string for TENANT_NOT_FOUND', async () => {
      (tenantService.getTenant as any).mockRejectedValue(new Error('Tenant not found'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants/x',
        headers: { authorization: SUPER_ADMIN_TOKEN },
      });

      const body = response.json();
      // The OLD (non-compliant) shape was: { error: "Not Found", message: "..." }
      // After T008-00, error MUST be an object, not a string
      expect(typeof body.error).not.toBe('string');
      expect(body.error).toBeTypeOf('object');
      expect(body.error).not.toBeNull();
    });

    it('should never return a flat error string for PLUGIN_NOT_FOUND', async () => {
      (marketplaceService.getPluginById as any).mockRejectedValue(new Error('Plugin not found'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/plugins/x',
        headers: { authorization: SUPER_ADMIN_TOKEN },
      });

      const body = response.json();
      expect(typeof body.error).not.toBe('string');
      expect(body.error).toBeTypeOf('object');
    });

    it('should never return a flat error string for USER_NOT_FOUND', async () => {
      (adminService.getUserById as any).mockRejectedValue(new Error('User not found'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users/x',
        headers: { authorization: SUPER_ADMIN_TOKEN },
      });

      const body = response.json();
      expect(typeof body.error).not.toBe('string');
      expect(body.error).toBeTypeOf('object');
    });
  });
});
