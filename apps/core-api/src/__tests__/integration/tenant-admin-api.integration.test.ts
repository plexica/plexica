// apps/core-api/src/__tests__/integration/tenant-admin-api.integration.test.ts
// T008-21 — Integration tests for tenant-admin routes (Spec 008 Admin Interfaces)
//
// Tests use a minimal Fastify instance (NOT buildTestApp) to avoid real service
// connections. All services are mocked. The tenant context is injected by mocking
// tenantContextMiddleware to set request.tenant directly.
//
// Constitution Compliance:
// - Article 6.2: All error responses verified to match { error: { code, message } }
// - NFR-004: Audit log endpoint never accepts tenant_id from query params

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock dependencies BEFORE imports ────────────────────────────────────────

vi.mock('@plexica/database', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    raw: (s: string) => s,
  },
}));

vi.mock('../../lib/db.js', () => ({
  db: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    tenant: { findUnique: vi.fn(), update: vi.fn() },
    tenantPlugin: { count: vi.fn() },
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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../services/audit-log.service.js', () => ({
  auditLogService: {
    log: vi.fn(),
    queryForTenant: vi.fn().mockResolvedValue({ logs: [], meta: { total: 0 } }),
  },
}));

vi.mock('../../services/keycloak.service.js', () => ({
  keycloakService: {
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    sendRequiredActionEmail: vi.fn(),
    assignRealmRoleToUser: vi.fn(),
    listUsers: vi.fn(),
    withRealmScope: vi.fn(),
  },
}));

// Mock the tenant admin service entirely for route-level tests
vi.mock('../../services/tenant-admin.service.js', () => ({
  tenantAdminService: {
    getDashboard: vi.fn(),
    listUsers: vi.fn(),
    inviteUser: vi.fn(),
    updateUser: vi.fn(),
    deactivateUser: vi.fn(),
    reactivateUser: vi.fn(),
    resendInvite: vi.fn(),
    cancelInvite: vi.fn(),
    listTeams: vi.fn(),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
    addTeamMember: vi.fn(),
    removeTeamMember: vi.fn(),
    listRoles: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    listPermissions: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
  DomainError: class DomainError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode = 400) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.name = 'DomainError';
    }
  },
}));

// Auth middleware: pass all requests as tenant_admin
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((_req: any, _reply: any, done: any) => done()),
  requireTenantAdmin: vi.fn((_req: any, _reply: any, done: any) => done()),
  requireSuperAdmin: vi.fn((_req: any, _reply: any, done: any) => done()),
  requireRole: vi.fn(() => (_req: any, _reply: any, done: any) => done()),
}));

// Tenant context middleware: inject a mock tenant into request
vi.mock('../../middleware/tenant-context.js', () => ({
  tenantContextMiddleware: vi.fn((req: any, _reply: any, done: any) => {
    req.tenant = {
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'acme',
      schemaName: 'tenant_acme',
    };
    done();
  }),
}));

vi.mock('@fastify/rate-limit', () => ({
  default: async (_instance: any, _opts: any) => {
    /* no-op */
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import fastify, { type FastifyInstance } from 'fastify';
import { tenantAdminRoutes } from '../../routes/tenant-admin.js';
import { tenantAdminService } from '../../services/tenant-admin.service.js';
import { auditLogService } from '../../services/audit-log.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AUTH = 'Bearer test-token';

function assertArt62Error(
  body: unknown
): asserts body is { error: { code: string; message: string } } {
  expect(body).toHaveProperty('error');
  expect(typeof (body as any).error).toBe('object');
  expect(typeof (body as any).error.code).toBe('string');
  expect(typeof (body as any).error.message).toBe('string');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('tenant-admin routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = fastify({ logger: false });
    await app.register(tenantAdminRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // --------------------------------------------------------------------------
  // GET /api/v1/tenant/dashboard
  // --------------------------------------------------------------------------

  describe('GET /api/v1/tenant/dashboard', () => {
    it('should return 200 with dashboard stats', async () => {
      const mockStats = {
        users: { total: 10, active: 7, invited: 2, deactivated: 1 },
        teams: { total: 3 },
        workspaces: { total: 5 },
        plugins: { enabled: 2, total: 8 },
        roles: { system: 3, custom: 2 },
      };
      (tenantAdminService.getDashboard as any).mockResolvedValue(mockStats);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/dashboard',
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ users: { total: 10 } });
    });

    it('should return Art. 6.2 error format on service failure', async () => {
      const { DomainError } = await import('../../services/tenant-admin.service.js');
      (tenantAdminService.getDashboard as any).mockRejectedValue(
        new DomainError('INTERNAL_ERROR', 'Something went wrong', 500)
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/dashboard',
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(500);
      assertArt62Error(res.json());
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/v1/tenant/users
  // --------------------------------------------------------------------------

  describe('GET /api/v1/tenant/users', () => {
    it('should return 200 with user list', async () => {
      (tenantAdminService.listUsers as any).mockResolvedValue({
        users: [{ id: 'u1', email: 'a@b.com' }],
        meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/users',
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().users).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/v1/tenant/users/invite
  // --------------------------------------------------------------------------

  describe('POST /api/v1/tenant/users/invite', () => {
    it('should return 201 on successful invite', async () => {
      (tenantAdminService.inviteUser as any).mockResolvedValue({
        id: 'new-user-id',
        email: 'new@example.com',
        status: 'invited',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tenant/users/invite',
        headers: { authorization: AUTH, 'content-type': 'application/json' },
        payload: { email: 'new@example.com', roleId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe('invited');
    });

    it('should return 400 on invalid email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tenant/users/invite',
        headers: { authorization: AUTH, 'content-type': 'application/json' },
        payload: { email: 'not-an-email', roleId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
      });

      expect(res.statusCode).toBe(400);
      assertArt62Error(res.json());
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('should return Art. 6.2 error format on USER_ALREADY_EXISTS', async () => {
      const { DomainError } = await import('../../services/tenant-admin.service.js');
      (tenantAdminService.inviteUser as any).mockRejectedValue(
        new DomainError('USER_ALREADY_EXISTS', 'User already exists', 409)
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tenant/users/invite',
        headers: { authorization: AUTH, 'content-type': 'application/json' },
        payload: { email: 'existing@example.com', roleId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
      });

      expect(res.statusCode).toBe(409);
      assertArt62Error(res.json());
      expect(res.json().error.code).toBe('USER_ALREADY_EXISTS');
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/v1/tenant/users/:userId/deactivate
  // --------------------------------------------------------------------------

  describe('POST /api/v1/tenant/users/:userId/deactivate', () => {
    it('should return 200 on successful deactivation', async () => {
      (tenantAdminService.deactivateUser as any).mockResolvedValue({
        id: 'u1',
        status: 'deactivated',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tenant/users/u1/deactivate',
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('deactivated');
    });

    it('should return 409 when deactivating last admin', async () => {
      const { DomainError } = await import('../../services/tenant-admin.service.js');
      (tenantAdminService.deactivateUser as any).mockRejectedValue(
        new DomainError('LAST_TENANT_ADMIN', 'Cannot deactivate last admin', 409)
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tenant/users/u1/deactivate',
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(409);
      assertArt62Error(res.json());
      expect(res.json().error.code).toBe('LAST_TENANT_ADMIN');
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/v1/tenant/teams
  // --------------------------------------------------------------------------

  describe('POST /api/v1/tenant/teams', () => {
    it('should return 201 with created team', async () => {
      (tenantAdminService.createTeam as any).mockResolvedValue({
        id: 'team-uuid',
        name: 'Engineering',
        description: null,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tenant/teams',
        headers: { authorization: AUTH, 'content-type': 'application/json' },
        payload: {
          name: 'Engineering',
          workspaceId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Engineering');
    });
  });

  // --------------------------------------------------------------------------
  // DELETE /api/v1/tenant/teams/:teamId
  // --------------------------------------------------------------------------

  describe('DELETE /api/v1/tenant/teams/:teamId', () => {
    it('should return 204 on successful deletion', async () => {
      (tenantAdminService.deleteTeam as any).mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/tenant/teams/team-uuid',
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
    });

    it('should return 404 when team not found', async () => {
      const { DomainError } = await import('../../services/tenant-admin.service.js');
      (tenantAdminService.deleteTeam as any).mockRejectedValue(
        new DomainError('TEAM_NOT_FOUND', 'Team not found', 404)
      );

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/tenant/teams/no-such-team',
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(404);
      assertArt62Error(res.json());
      expect(res.json().error.code).toBe('TEAM_NOT_FOUND');
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/v1/tenant/roles
  // --------------------------------------------------------------------------

  describe('POST /api/v1/tenant/roles', () => {
    it('should return 201 with created role', async () => {
      (tenantAdminService.createRole as any).mockResolvedValue({
        id: 'role-uuid',
        name: 'Editor',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tenant/roles',
        headers: { authorization: AUTH, 'content-type': 'application/json' },
        payload: { name: 'Editor' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Editor');
    });

    it('should return 422 when custom role limit exceeded', async () => {
      const { DomainError } = await import('../../services/tenant-admin.service.js');
      (tenantAdminService.createRole as any).mockRejectedValue(
        new DomainError('CUSTOM_ROLE_LIMIT_EXCEEDED', 'Maximum 50 custom roles', 422)
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tenant/roles',
        headers: { authorization: AUTH, 'content-type': 'application/json' },
        payload: { name: 'TooMany' },
      });

      expect(res.statusCode).toBe(422);
      assertArt62Error(res.json());
    });
  });

  // --------------------------------------------------------------------------
  // PATCH /api/v1/tenant/settings
  // --------------------------------------------------------------------------

  describe('PATCH /api/v1/tenant/settings', () => {
    it('should return 200 with updated settings', async () => {
      (tenantAdminService.updateSettings as any).mockResolvedValue({
        settings: { id: 'tenant-uuid-1', name: 'New Name', slug: 'acme' },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/tenant/settings',
        headers: { authorization: AUTH, 'content-type': 'application/json' },
        payload: { name: 'New Name' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().settings.name).toBe('New Name');
    });
  });

  // --------------------------------------------------------------------------
  // NFR-004: GET /api/v1/tenant/audit-logs — tenant_id query param is ignored
  // --------------------------------------------------------------------------

  describe('GET /api/v1/tenant/audit-logs — NFR-004', () => {
    it('should always use context tenantId, ignoring tenant_id query param', async () => {
      (auditLogService.queryForTenant as any).mockResolvedValue({
        logs: [],
        meta: { total: 0 },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/audit-logs?tenant_id=OTHER-TENANT-UUID',
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);

      // CRITICAL: queryForTenant must be called with the context tenantId,
      // NOT with 'OTHER-TENANT-UUID' from the query param.
      expect(auditLogService.queryForTenant).toHaveBeenCalledWith(
        'tenant-uuid-1', // context tenantId
        expect.any(Object)
      );
      // Verify the filters object passed to queryForTenant does NOT contain tenant_id
      const callArgs = (auditLogService.queryForTenant as any).mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('tenantId');
    });

    it('should pass page/limit filters from query params', async () => {
      (auditLogService.queryForTenant as any).mockResolvedValue({
        logs: [{ id: 'log-1', action: 'USER_INVITED' }],
        meta: { total: 1 },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/audit-logs?page=2&limit=25',
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      const filters = (auditLogService.queryForTenant as any).mock.calls[0][1];
      expect(filters.page).toBe(2);
      expect(filters.limit).toBe(25);
    });
  });
});
