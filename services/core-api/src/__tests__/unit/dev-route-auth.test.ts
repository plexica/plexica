// Unit tests for devRouteAuth middleware.
// Verifies the dev-only gates (NODE_ENV, loopback, X-Tenant-Slug header) and
// that a valid dev request resolves a tenant context without a user JWT.
// Regression: dev plugin registration routes used to sit behind authMiddleware
// in the tenantScope, so registerBackend() (no JWT) always got 401.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/tenant-context.js', () => ({
  resolveTenant: vi.fn(),
}));

import { InvalidTenantContextError, TenantPendingDeletionError, TenantSuspendedError } from '../../lib/app-error.js';
import { devRouteAuth } from '../../middleware/dev-route-auth.js';
import { resolveTenant } from '../../middleware/tenant-context.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const mockResolveTenant = vi.mocked(resolveTenant);

function makeRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    socket: { remoteAddress: '127.0.0.1' } as unknown as FastifyRequest['socket'],
    headers: { 'x-tenant-slug': 'acme' },
    ...overrides,
  } as FastifyRequest;
}

function makeReply(): FastifyReply {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
  } as unknown as FastifyReply;
}

const ACTIVE_CONTEXT: TenantContext = {
  tenantId: 'tenant-1',
  slug: 'acme',
  schemaName: 'tenant_acme',
  realmName: 'acme',
};

beforeEach(() => {
  process.env['NODE_ENV'] = 'development';
  mockResolveTenant.mockReset();
  mockResolveTenant.mockResolvedValue({ status: 'active', context: ACTIVE_CONTEXT });
});

describe('devRouteAuth', () => {
  it('allows a loopback request with a valid tenant header', async () => {
    const req = makeRequest();
    const reply = makeReply();
    await expect(devRouteAuth(req, reply)).resolves.toBeUndefined();
    expect(mockResolveTenant).toHaveBeenCalledWith('acme');
    expect(req.tenantContext).toEqual(ACTIVE_CONTEXT);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns 404 when NODE_ENV is not development', async () => {
    const req = makeRequest();
    const reply = makeReply();
    process.env['NODE_ENV'] = 'production';
    try {
      await devRouteAuth(req, reply);
    } finally {
      process.env['NODE_ENV'] = 'development';
    }
    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Not found' });
    expect(mockResolveTenant).not.toHaveBeenCalled();
  });

  it('fails closed when NODE_ENV is unset (default production)', async () => {
    const req = makeRequest();
    const reply = makeReply();
    delete process.env['NODE_ENV'];
    try {
      await devRouteAuth(req, reply);
    } finally {
      process.env['NODE_ENV'] = 'development';
    }
    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Not found' });
    expect(mockResolveTenant).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-loopback remote address', async () => {
    const req = makeRequest({
      socket: { remoteAddress: '10.0.0.5' } as unknown as FastifyRequest['socket'],
    });
    const reply = makeReply();
    await devRouteAuth(req, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(mockResolveTenant).not.toHaveBeenCalled();
  });

  it('throws InvalidTenantContextError when the tenant header is missing', async () => {
    const req = makeRequest({ headers: {} });
    const reply = makeReply();
    await expect(devRouteAuth(req, reply)).rejects.toThrow(InvalidTenantContextError);
    expect(mockResolveTenant).not.toHaveBeenCalled();
  });

  it('throws InvalidTenantContextError for an unknown tenant', async () => {
    mockResolveTenant.mockResolvedValue(null);
    const req = makeRequest();
    const reply = makeReply();
    await expect(devRouteAuth(req, reply)).rejects.toThrow(InvalidTenantContextError);
  });

  it('throws TenantSuspendedError for a suspended tenant (ADR-022)', async () => {
    mockResolveTenant.mockResolvedValue({ status: 'suspended', context: null });
    const req = makeRequest();
    const reply = makeReply();
    await expect(devRouteAuth(req, reply)).rejects.toThrow(TenantSuspendedError);
  });

  it('throws TenantPendingDeletionError for a pending-deletion tenant (ADR-022)', async () => {
    mockResolveTenant.mockResolvedValue({ status: 'pending_deletion', context: null });
    const req = makeRequest();
    const reply = makeReply();
    await expect(devRouteAuth(req, reply)).rejects.toThrow(TenantPendingDeletionError);
  });

  it('accepts IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', async () => {
    const req = makeRequest({
      socket: { remoteAddress: '::ffff:127.0.0.1' } as unknown as FastifyRequest['socket'],
    });
    const reply = makeReply();
    await expect(devRouteAuth(req, reply)).resolves.toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('rejects a non-loopback IPv6 address', async () => {
    const req = makeRequest({
      socket: { remoteAddress: '2001:db8::1' } as unknown as FastifyRequest['socket'],
    });
    const reply = makeReply();
    await devRouteAuth(req, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });
});