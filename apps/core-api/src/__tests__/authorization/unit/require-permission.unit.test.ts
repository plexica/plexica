// apps/core-api/src/__tests__/authorization/unit/require-permission.unit.test.ts
//
// Unit tests for requirePermission() middleware.
// Spec 003 Task 5.5 — 100% coverage required (NFR-004, NFR-005, Art. 5.1)
//
// Paths:
//   1. 401 — request.user is undefined
//   2. 403 — getTenantBySlug throws (unknown/suspended tenant, fail-closed)
//   3. 403 — authorizationService.authorize returns permitted=false
//   4. void — authorize returns permitted=true (pass-through)

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables are initialized before vi.mock() hoisting
// ---------------------------------------------------------------------------

const { mockGetTenantBySlug, mockGetSchemaName, mockAuthorize } = vi.hoisted(() => ({
  mockGetTenantBySlug: vi.fn(),
  mockGetSchemaName: vi.fn(),
  mockAuthorize: vi.fn(),
}));

vi.mock('../../../services/tenant.service.js', () => ({
  tenantService: {
    getTenantBySlug: mockGetTenantBySlug,
    getSchemaName: mockGetSchemaName,
  },
}));

vi.mock('../../../modules/authorization/authorization.service.js', () => ({
  authorizationService: {
    authorize: mockAuthorize,
  },
}));

// requirePermission also imports jwt/lib — stub anything it needs at module level
vi.mock('../../../lib/jwt.js', () => ({
  extractBearerToken: vi.fn(),
  verifyTokenWithTenant: vi.fn(),
  extractUserInfo: vi.fn(),
}));

// Import after mocks
import { requirePermission } from '../../../middleware/auth.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(user?: { id: string; tenantSlug: string }): FastifyRequest {
  return { user } as unknown as FastifyRequest;
}

function makeReply(): { code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requirePermission()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSchemaName.mockReturnValue('tenant_acme');
  });

  it('should return 401 when request.user is undefined', async () => {
    const handler = requirePermission('posts:read');
    const req = makeRequest(undefined);
    const reply = makeReply();

    await handler(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
    });
    expect(mockGetTenantBySlug).not.toHaveBeenCalled();
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it('should return 403 (fail-closed) when getTenantBySlug throws', async () => {
    mockGetTenantBySlug.mockRejectedValue(new Error('Tenant not found'));

    const handler = requirePermission('posts:read');
    const req = makeRequest({ id: 'user-1', tenantSlug: 'acme' });
    const reply = makeReply();

    await handler(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(mockGetTenantBySlug).toHaveBeenCalledWith('acme');
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_INSUFFICIENT_PERMISSION',
        message: 'You do not have permission to perform this action',
      },
    });
    // NFR-005: no permission name in response
    const body = reply.send.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('posts:read');
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it('should return 403 when authorize returns permitted=false', async () => {
    mockGetTenantBySlug.mockResolvedValue({ id: 'tenant-uuid-1', slug: 'acme' });
    mockAuthorize.mockResolvedValue({ permitted: false, reason: 'RBAC_DENY' });

    const handler = requirePermission('posts:write');
    const req = makeRequest({ id: 'user-1', tenantSlug: 'acme' });
    const reply = makeReply();

    await handler(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(mockAuthorize).toHaveBeenCalledWith('user-1', 'tenant-uuid-1', 'tenant_acme', [
      'posts:write',
    ]);
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_INSUFFICIENT_PERMISSION',
        message: 'You do not have permission to perform this action',
      },
    });
    // NFR-004: no permission name in the 403 body
    const body = reply.send.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('posts:write');
  });

  it('should pass through (return undefined) when authorize returns permitted=true', async () => {
    mockGetTenantBySlug.mockResolvedValue({ id: 'tenant-uuid-1', slug: 'acme' });
    mockAuthorize.mockResolvedValue({ permitted: true });

    const handler = requirePermission('posts:read');
    const req = makeRequest({ id: 'user-1', tenantSlug: 'acme' });
    const reply = makeReply();

    const result = await handler(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(result).toBeUndefined();
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('should pass multiple permissions to authorize', async () => {
    mockGetTenantBySlug.mockResolvedValue({ id: 'tenant-uuid-1', slug: 'acme' });
    mockAuthorize.mockResolvedValue({ permitted: true });

    const handler = requirePermission('posts:read', 'comments:read');
    const req = makeRequest({ id: 'user-1', tenantSlug: 'acme' });
    const reply = makeReply();

    await handler(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(mockAuthorize).toHaveBeenCalledWith('user-1', 'tenant-uuid-1', 'tenant_acme', [
      'posts:read',
      'comments:read',
    ]);
  });

  it('should derive schemaName from tenantSlug via tenantService.getSchemaName', async () => {
    mockGetSchemaName.mockReturnValue('tenant_my_org');
    mockGetTenantBySlug.mockResolvedValue({ id: 'tenant-uuid-2', slug: 'my-org' });
    mockAuthorize.mockResolvedValue({ permitted: true });

    const handler = requirePermission('settings:read');
    const req = makeRequest({ id: 'user-2', tenantSlug: 'my-org' });
    const reply = makeReply();

    await handler(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(mockGetSchemaName).toHaveBeenCalledWith('my-org');
    expect(mockAuthorize).toHaveBeenCalledWith('user-2', 'tenant-uuid-2', 'tenant_my_org', [
      'settings:read',
    ]);
  });
});
