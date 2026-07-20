// require-super-admin.test.ts
// Integration tests for the requireSuperAdmin middleware — H-03 security fix.
//
// Verifies that:
// 1. A master-realm token with super_admin role is accepted (happy path)
// 2. A tenant-realm token with super_admin role is REJECTED (H-03 fix)
// 3. A master-realm token WITHOUT super_admin role is rejected
// 4. An unauthenticated request (no request.user) is rejected
//
// Uses lightweight Fastify stubs — no real DB or Keycloak required.
// The requireSuperAdmin middleware is the unit under test.

import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';

import { configureErrorHandler } from '../middleware/error-handler.js';
import { requireSuperAdmin } from '../middleware/require-super-admin.js';
import { TRUSTED_AUTH_SYMBOL } from '../middleware/auth-middleware.js';

import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../middleware/auth-middleware.js';

function makeUser(realm: string, roles: string[]): AuthUser {
  return {
    id: 'test-user',
    keycloakUserId: 'test-user',
    email: 'test@test.io',
    firstName: 'Test',
    lastName: 'User',
    realm,
    roles,
  };
}

async function buildServer(user: AuthUser | undefined): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  configureErrorHandler(server);

  if (user !== undefined) {
    server.addHook('onRequest', async (request) => {
      request.user = user;
      (request as Record<symbol, boolean>)[TRUSTED_AUTH_SYMBOL] = true;
    });
  }

  server.get('/test-admin', { preHandler: [requireSuperAdmin] }, async () => ({
    ok: true,
  }));

  await server.ready();
  return server;
}

describe('requireSuperAdmin — H-03 master realm enforcement', () => {
  it('accepts a master-realm token with super_admin role', async () => {
    const server = await buildServer(makeUser('master', ['super_admin']));
    try {
      const res = await server.inject({ method: 'GET', url: '/test-admin' });
      expect(res.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('rejects a tenant-realm token with super_admin role (H-03 fix)', async () => {
    const server = await buildServer(makeUser('plexica-acme', ['super_admin']));
    try {
      const res = await server.inject({ method: 'GET', url: '/test-admin' });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body) as { error: { code: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
    } finally {
      await server.close();
    }
  });

  it('rejects a master-realm token without super_admin role', async () => {
    const server = await buildServer(makeUser('master', ['tenant_admin']));
    try {
      const res = await server.inject({ method: 'GET', url: '/test-admin' });
      expect(res.statusCode).toBe(401);
    } finally {
      await server.close();
    }
  });

  it('rejects an unauthenticated request (no request.user)', async () => {
    const server = await buildServer(undefined);
    try {
      const res = await server.inject({ method: 'GET', url: '/test-admin' });
      expect(res.statusCode).toBe(401);
    } finally {
      await server.close();
    }
  });
});
