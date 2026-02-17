// File: apps/core-api/src/__tests__/tenant/unit/tenant-isolation.unit.test.ts
//
// Unit tests for tenant isolation guarantees.
// Verifies that tenant contexts are properly isolated via AsyncLocalStorage,
// that executeInTenantSchema enforces schema boundaries, and that the
// middleware correctly gates access based on tenant status and identity.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  tenantContextStorage,
  getTenantContext,
  getCurrentTenantSchema,
  getWorkspaceIdOrThrow,
  getWorkspaceId,
  setWorkspaceId,
  getUserId,
  setUserId,
  executeInTenantSchema,
  tenantContextMiddleware,
  type TenantContext,
} from '../../../middleware/tenant-context.js';
import { tenantService } from '../../../services/tenant.service.js';

// Mock external dependencies
vi.mock('../../../services/tenant.service.js', () => ({
  tenantService: {
    getTenantBySlug: vi.fn(),
    getSchemaName: vi.fn(),
  },
}));

vi.mock('../../../lib/header-validator.js', () => ({
  validateCustomHeaders: vi.fn((headers: Record<string, any>) => {
    const result: { tenantSlug?: string; workspaceId?: string; errors: string[] } = {
      errors: [],
    };
    if (headers['x-tenant-slug']) {
      const slug = String(headers['x-tenant-slug']).trim();
      if (/^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/.test(slug)) {
        result.tenantSlug = slug;
      } else {
        result.errors.push(`Invalid X-Tenant-Slug header: "${slug}"`);
      }
    }
    if (headers['x-workspace-id']) {
      result.workspaceId = headers['x-workspace-id'];
    }
    return result;
  }),
  logSuspiciousHeader: vi.fn(),
}));

vi.mock('../../../lib/db.js', () => ({
  db: {
    $executeRaw: vi.fn(),
  },
}));

// Helper to create a TenantContext
function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: 'tenant-abc',
    tenantSlug: 'acme',
    schemaName: 'tenant_acme',
    ...overrides,
  };
}

// Helper to create mock Fastify request/reply
function makeMockRequestReply(overrides: { url?: string; headers?: Record<string, any> }): {
  request: FastifyRequest;
  reply: FastifyReply;
} {
  const request = {
    url: overrides.url ?? '/api/something',
    headers: overrides.headers ?? {},
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  } as unknown as FastifyRequest;

  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;

  return { request, reply };
}

describe('Tenant Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // NOTE: User sync cache removed in Spec 002 Phase 5 (async sync via UserSyncConsumer)
  });

  // ─────────────────────────────────────────────────────────
  // 1. AsyncLocalStorage context isolation
  // ─────────────────────────────────────────────────────────
  describe('AsyncLocalStorage context isolation', () => {
    it('should return undefined outside any tenant context', () => {
      expect(getTenantContext()).toBeUndefined();
      expect(getCurrentTenantSchema()).toBeUndefined();
      expect(getWorkspaceId()).toBeUndefined();
      expect(getUserId()).toBeUndefined();
    });

    it('should provide the correct context inside tenantContextStorage.run()', () => {
      const ctx = makeTenantContext({ workspaceId: 'ws-1', userId: 'u-1' });

      tenantContextStorage.run(ctx, () => {
        expect(getTenantContext()).toBe(ctx);
        expect(getCurrentTenantSchema()).toBe('tenant_acme');
        expect(getWorkspaceId()).toBe('ws-1');
        expect(getUserId()).toBe('u-1');
      });
    });

    it('should isolate two concurrent tenant contexts from each other', async () => {
      const ctxA = makeTenantContext({
        tenantId: 'tenant-a',
        tenantSlug: 'alpha',
        schemaName: 'tenant_alpha',
      });
      const ctxB = makeTenantContext({
        tenantId: 'tenant-b',
        tenantSlug: 'beta',
        schemaName: 'tenant_beta',
      });

      // Run two async operations concurrently; each should see only its own context
      const [resultA, resultB] = await Promise.all([
        tenantContextStorage.run(ctxA, async () => {
          // Yield the event loop so B can interleave
          await new Promise((r) => setTimeout(r, 5));
          return getTenantContext();
        }),
        tenantContextStorage.run(ctxB, async () => {
          await new Promise((r) => setTimeout(r, 5));
          return getTenantContext();
        }),
      ]);

      expect(resultA).toBe(ctxA);
      expect(resultB).toBe(ctxB);
      expect(resultA!.tenantId).toBe('tenant-a');
      expect(resultB!.tenantId).toBe('tenant-b');
    });

    it('should not leak context after tenantContextStorage.run() completes', () => {
      const ctx = makeTenantContext();

      tenantContextStorage.run(ctx, () => {
        expect(getTenantContext()).toBe(ctx);
      });

      // Outside the run callback, context must not be visible
      expect(getTenantContext()).toBeUndefined();
    });

    it('should isolate nested contexts so inner does not leak to outer', () => {
      const outer = makeTenantContext({ tenantId: 'outer', schemaName: 'tenant_outer' });
      const inner = makeTenantContext({ tenantId: 'inner', schemaName: 'tenant_inner' });

      tenantContextStorage.run(outer, () => {
        expect(getTenantContext()!.tenantId).toBe('outer');

        tenantContextStorage.run(inner, () => {
          expect(getTenantContext()!.tenantId).toBe('inner');
        });

        // After inner run completes, outer context should be restored
        expect(getTenantContext()!.tenantId).toBe('outer');
      });
    });
  });

  // ─────────────────────────────────────────────────────────
  // 2. getWorkspaceIdOrThrow isolation
  // ─────────────────────────────────────────────────────────
  describe('getWorkspaceIdOrThrow', () => {
    it('should throw when called outside any tenant context', () => {
      expect(() => getWorkspaceIdOrThrow()).toThrow('No tenant context available');
    });

    it('should throw when context exists but workspaceId is not set', () => {
      const ctx = makeTenantContext(); // no workspaceId

      expect(() => tenantContextStorage.run(ctx, () => getWorkspaceIdOrThrow())).toThrow(
        'No workspace context available'
      );
    });

    it('should return workspace ID when set in context', () => {
      const ctx = makeTenantContext({ workspaceId: 'ws-42' });

      const result = tenantContextStorage.run(ctx, () => getWorkspaceIdOrThrow());
      expect(result).toBe('ws-42');
    });
  });

  // ─────────────────────────────────────────────────────────
  // 3. setWorkspaceId / setUserId mutation isolation
  // ─────────────────────────────────────────────────────────
  describe('setWorkspaceId', () => {
    it('should throw when no tenant context is available', () => {
      expect(() => setWorkspaceId('ws-1')).toThrow('No tenant context available');
    });

    it('should mutate the workspace ID inside the current context only', () => {
      const ctxA = makeTenantContext();
      const ctxB = makeTenantContext();

      tenantContextStorage.run(ctxA, () => {
        setWorkspaceId('ws-for-a');
        expect(getWorkspaceId()).toBe('ws-for-a');
      });

      // ctxB should not be affected
      tenantContextStorage.run(ctxB, () => {
        expect(getWorkspaceId()).toBeUndefined();
      });
    });
  });

  describe('setUserId', () => {
    it('should throw when no tenant context is available', () => {
      expect(() => setUserId('u-1')).toThrow('No tenant context available');
    });

    it('should set and read user ID within the same context', () => {
      const ctx = makeTenantContext();

      tenantContextStorage.run(ctx, () => {
        expect(getUserId()).toBeUndefined();
        setUserId('u-99');
        expect(getUserId()).toBe('u-99');
      });
    });

    it('should not leak userId between separate contexts', () => {
      const ctxA = makeTenantContext();
      const ctxB = makeTenantContext();

      tenantContextStorage.run(ctxA, () => {
        setUserId('user-a');
      });

      tenantContextStorage.run(ctxB, () => {
        expect(getUserId()).toBeUndefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────
  // 4. executeInTenantSchema – schema boundary enforcement
  // ─────────────────────────────────────────────────────────
  describe('executeInTenantSchema', () => {
    let mockPrisma: { $executeRaw: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockPrisma = {
        $executeRaw: vi.fn().mockResolvedValue(undefined),
      };
    });

    it('should throw when no tenant context is available', async () => {
      await expect(executeInTenantSchema(mockPrisma, async () => 'result')).rejects.toThrow(
        'No tenant context available'
      );

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should reject SQL injection attempts in schema name', async () => {
      const maliciousNames = [
        "'; DROP TABLE users; --",
        'tenant_acme; DROP TABLE',
        'tenant-acme',
        'TENANT_UPPER',
        'tenant acme',
        '../etc/passwd',
        'tenant_acme"',
      ];

      for (const schemaName of maliciousNames) {
        const ctx = makeTenantContext({ schemaName });

        await expect(
          tenantContextStorage.run(ctx, () =>
            executeInTenantSchema(mockPrisma, async () => 'should not reach')
          )
        ).rejects.toThrow('Invalid schema name');
      }

      // No SQL should have been executed for any malicious name
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should accept valid schema names containing only lowercase, digits, and underscores', async () => {
      const validNames = ['tenant_acme', 'tenant_123', 'a', 'tenant_foo_bar_123'];

      for (const schemaName of validNames) {
        mockPrisma.$executeRaw.mockClear();
        const ctx = makeTenantContext({ schemaName });

        const result = await tenantContextStorage.run(ctx, () =>
          executeInTenantSchema(mockPrisma, async () => `ok:${schemaName}`)
        );

        expect(result).toBe(`ok:${schemaName}`);
        expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2); // SET + RESET
      }
    });

    it('should call SET search_path before the callback and reset after', async () => {
      const callOrder: string[] = [];
      mockPrisma.$executeRaw.mockImplementation(async (..._args: unknown[]) => {
        callOrder.push('$executeRaw');
      });

      const ctx = makeTenantContext({ schemaName: 'tenant_acme' });

      await tenantContextStorage.run(ctx, () =>
        executeInTenantSchema(mockPrisma, async () => {
          callOrder.push('callback');
          return 'done';
        })
      );

      expect(callOrder).toEqual(['$executeRaw', 'callback', '$executeRaw']);
    });

    it('should pass the prisma client to the callback', async () => {
      const ctx = makeTenantContext();

      let receivedClient: unknown;
      await tenantContextStorage.run(ctx, () =>
        executeInTenantSchema(mockPrisma, async (client) => {
          receivedClient = client;
        })
      );

      expect(receivedClient).toBe(mockPrisma);
    });

    it('should return the value produced by the callback', async () => {
      const ctx = makeTenantContext();

      const result = await tenantContextStorage.run(ctx, () =>
        executeInTenantSchema(mockPrisma, async () => ({ rows: [1, 2, 3] }))
      );

      expect(result).toEqual({ rows: [1, 2, 3] });
    });

    it('should reset search_path even when callback throws', async () => {
      const ctx = makeTenantContext();

      await expect(
        tenantContextStorage.run(ctx, () =>
          executeInTenantSchema(mockPrisma, async () => {
            throw new Error('query blew up');
          })
        )
      ).rejects.toThrow('query blew up');

      // SET + RESET = 2 calls even on failure
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('should use an explicitly provided tenantCtx over the AsyncLocalStorage context', async () => {
      const storageCtx = makeTenantContext({ schemaName: 'tenant_storage' });
      const explicitCtx = makeTenantContext({ schemaName: 'tenant_explicit' });

      const callOrder: string[] = [];
      mockPrisma.$executeRaw.mockImplementation(async (..._args: unknown[]) => {
        callOrder.push('exec');
      });

      await tenantContextStorage.run(storageCtx, () =>
        executeInTenantSchema(
          mockPrisma,
          async () => {
            callOrder.push('callback');
          },
          explicitCtx
        )
      );

      // It should succeed (using explicitCtx), not use storageCtx
      expect(callOrder).toEqual(['exec', 'callback', 'exec']);
      // 2 $executeRaw calls confirms it used the explicit context successfully
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('should throw when explicit tenantCtx has no schemaName', async () => {
      const noSchemaCtx = {
        tenantId: 'x',
        tenantSlug: 'x',
        schemaName: '',
      } as TenantContext;

      // Empty string is falsy, so it should throw
      await expect(
        executeInTenantSchema(mockPrisma, async () => 'nope', noSchemaCtx)
      ).rejects.toThrow('No tenant context available');
    });
  });

  // ─────────────────────────────────────────────────────────
  // 5. tenantContextMiddleware – request gating
  // ─────────────────────────────────────────────────────────
  describe('tenantContextMiddleware', () => {
    it('should skip /health route without requiring tenant header', async () => {
      const { request, reply } = makeMockRequestReply({ url: '/health' });

      await tenantContextMiddleware(request, reply);

      expect(tenantService.getTenantBySlug).not.toHaveBeenCalled();
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should skip /docs route without requiring tenant header', async () => {
      const { request, reply } = makeMockRequestReply({ url: '/docs/openapi' });

      await tenantContextMiddleware(request, reply);

      expect(tenantService.getTenantBySlug).not.toHaveBeenCalled();
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should skip /api/tenants route', async () => {
      const { request, reply } = makeMockRequestReply({ url: '/api/tenants' });

      await tenantContextMiddleware(request, reply);

      expect(tenantService.getTenantBySlug).not.toHaveBeenCalled();
    });

    it('should return 400 when no X-Tenant-Slug header is provided', async () => {
      const { request, reply } = makeMockRequestReply({ headers: {} });

      await tenantContextMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Tenant identification required. Provide X-Tenant-Slug header.',
        })
      );
    });

    it('should return 400 when X-Tenant-Slug header fails validation', async () => {
      const { request, reply } = makeMockRequestReply({
        headers: { 'x-tenant-slug': 'INVALID_SLUG!' },
      });

      await tenantContextMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Bad Request' }));
      expect(tenantService.getTenantBySlug).not.toHaveBeenCalled();
    });

    it('should return 404 when tenant is not found in the database', async () => {
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(null);

      const { request, reply } = makeMockRequestReply({
        headers: { 'x-tenant-slug': 'nonexistent' },
      });

      await tenantContextMiddleware(request, reply);

      expect(tenantService.getTenantBySlug).toHaveBeenCalledWith('nonexistent');
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Not Found',
          message: "Tenant 'nonexistent' not found",
        })
      );
    });

    it('should return 403 when tenant status is SUSPENDED', async () => {
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue({
        id: 'tid',
        slug: 'suspended-co',
        status: 'SUSPENDED',
      } as any);

      const { request, reply } = makeMockRequestReply({
        headers: { 'x-tenant-slug': 'suspended-co' },
      });

      await tenantContextMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          message: "Tenant 'suspended-co' is not active (status: SUSPENDED)",
        })
      );
    });

    it('should return 403 when tenant status is PROVISIONING', async () => {
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue({
        id: 'tid',
        slug: 'new-co',
        status: 'PROVISIONING',
      } as any);

      const { request, reply } = makeMockRequestReply({
        headers: { 'x-tenant-slug': 'new-co' },
      });

      await tenantContextMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should set context correctly for a valid active tenant', async () => {
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue({
        id: 'tenant-999',
        slug: 'good-tenant',
        status: 'ACTIVE',
      } as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_good_tenant');

      const { request, reply } = makeMockRequestReply({
        headers: { 'x-tenant-slug': 'good-tenant' },
      });

      await tenantContextMiddleware(request, reply);

      // Should not return any error
      expect(reply.code).not.toHaveBeenCalled();

      // Should attach tenant context to request
      const attached = (request as any).tenant;
      expect(attached).toBeDefined();
      expect(attached.tenantId).toBe('tenant-999');
      expect(attached.tenantSlug).toBe('good-tenant');
      expect(attached.schemaName).toBe('tenant_good_tenant');
    });

    it('should include validated workspaceId from headers in the context', async () => {
      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue({
        id: 'tid',
        slug: 'ws-tenant',
        status: 'ACTIVE',
      } as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_ws_tenant');

      const wsId = '550e8400-e29b-41d4-a716-446655440000';
      const { request, reply } = makeMockRequestReply({
        headers: {
          'x-tenant-slug': 'ws-tenant',
          'x-workspace-id': wsId,
        },
      });

      await tenantContextMiddleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect((request as any).tenant.workspaceId).toBe(wsId);
    });

    it('should return 500 when getTenantBySlug throws', async () => {
      vi.mocked(tenantService.getTenantBySlug).mockRejectedValue(new Error('DB connection lost'));

      const { request, reply } = makeMockRequestReply({
        headers: { 'x-tenant-slug': 'some-tenant' },
      });

      await tenantContextMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Server Error',
          message: 'Failed to set tenant context',
        })
      );
    });

    it('should not allow tenant A middleware to produce context visible from tenant B request', async () => {
      // Simulate two requests for different tenants processed concurrently.
      // Each should see only its own context inside tenantContextStorage.run().

      vi.mocked(tenantService.getTenantBySlug).mockImplementation(async (slug: string) => {
        if (slug === 'alpha') return { id: 'a-id', slug: 'alpha', status: 'ACTIVE' } as any;
        if (slug === 'beta') return { id: 'b-id', slug: 'beta', status: 'ACTIVE' } as any;
        return null;
      });
      vi.mocked(tenantService.getSchemaName).mockImplementation((slug: string) => `tenant_${slug}`);

      // Use tenantContextStorage.run to simulate request-scoped isolation
      const [ctxA, ctxB] = await Promise.all([
        tenantContextStorage.run(
          makeTenantContext({ tenantId: 'a-id', schemaName: 'tenant_alpha' }),
          async () => {
            await new Promise((r) => setTimeout(r, 10));
            return getTenantContext();
          }
        ),
        tenantContextStorage.run(
          makeTenantContext({ tenantId: 'b-id', schemaName: 'tenant_beta' }),
          async () => {
            await new Promise((r) => setTimeout(r, 10));
            return getTenantContext();
          }
        ),
      ]);

      expect(ctxA!.tenantId).toBe('a-id');
      expect(ctxB!.tenantId).toBe('b-id');
    });
  });

  // ─────────────────────────────────────────────────────────
  // 6. Schema name validation (SQL injection prevention)
  // ─────────────────────────────────────────────────────────
  describe('Schema name SQL injection prevention', () => {
    let mockPrisma: { $executeRaw: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockPrisma = { $executeRaw: vi.fn().mockResolvedValue(undefined) };
    });

    const injectionPayloads = [
      "'; DROP TABLE users; --",
      'tenant_acme"; DELETE FROM tenants; --',
      'public; DROP SCHEMA tenant_acme CASCADE',
      "' OR '1'='1",
      'tenant_acme\x00malicious',
      'tenant_acme; SELECT pg_sleep(10)',
    ];

    it.each(injectionPayloads)('should reject schema name: %s', async (maliciousSchema) => {
      const ctx = makeTenantContext({ schemaName: maliciousSchema });

      await expect(
        tenantContextStorage.run(ctx, () =>
          executeInTenantSchema(mockPrisma, async () => 'should not run')
        )
      ).rejects.toThrow('Invalid schema name');

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  // NOTE: clearUserSyncCache test removed in Spec 002 Phase 5
  // (user sync now handled asynchronously via UserSyncConsumer)
});
