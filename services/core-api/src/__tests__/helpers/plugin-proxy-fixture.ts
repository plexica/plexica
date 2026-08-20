// plugin-proxy-fixture.ts
// Shared fixtures for plugin proxy lifecycle tests (split from
// plugin-proxy-lifecycle.test.ts to satisfy the 200-line rule).
// Creates the fake plugin backend server and the request helpers that
// assert the visibility gate behavior.

import { createServer } from 'node:http';

import { expect } from 'vitest';

import { TRUSTED_AUTH_SYMBOL } from '../../middleware/auth-middleware.js';

import type { AddressInfo } from 'node:net';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthUser } from '../../middleware/auth-middleware.js';
import type { TenantContext } from '../../lib/tenant-context-store.js';

export const SLUG = `proxy-lifecycle-${process.pid}`;
export const PLUGIN_SLUG = `proxy-fixture-${process.pid}`;
export const MEMBER_ID = '00000000-0000-4000-8000-000000000041';
export const OUTSIDER_ID = '00000000-0000-4000-8000-000000000042';

export interface FixtureRequestResult {
  statusCode: number;
  json: () => unknown;
}

export interface ProxyFixture {
  context: TenantContext;
  forwarded: { count: number };
  backend: ReturnType<typeof createServer>;
  port: () => number;
  close: () => Promise<void>;
  authStub: (request: FastifyRequest) => Promise<void>;
  proxyHeaders: (workspaceId?: string, admin?: boolean) => Record<string, string>;
  request: (
    installId: string,
    workspaceId?: string,
    admin?: boolean,
    outsider?: boolean,
  ) => Promise<FixtureRequestResult>;
  expectDenied: (task: () => Promise<FixtureRequestResult>) => Promise<void>;
}

interface ProxyFixtureOptions {
  app: FastifyInstance;
  context: TenantContext;
  forwarded: { count: number };
}

/** Build the request helpers bound to the Fastify app under test. */
export function bindProxyFixture({
  app,
  context,
  forwarded,
}: ProxyFixtureOptions): Omit<ProxyFixture, 'context' | 'forwarded' | 'backend' | 'port' | 'close'> {
  const authStub = async (request: FastifyRequest): Promise<void> => {
    const admin = request.headers['x-test-admin'] === 'true';
    const userId = request.headers['x-test-outsider'] === 'true' ? OUTSIDER_ID : MEMBER_ID;
    request.user = {
      id: userId,
      keycloakUserId: userId,
      email: 'proxy-test@example.invalid',
      firstName: 'Proxy',
      lastName: 'Test',
      realm: context.realmName,
      roles: admin ? ['tenant_admin'] : [],
    } satisfies AuthUser;
    request.tenantContext = context;
    (request as Record<symbol, boolean>)[TRUSTED_AUTH_SYMBOL] = true;
  };

  const proxyHeaders = (workspaceId?: string, admin = false): Record<string, string> => ({
    ...(workspaceId ? { 'x-plexica-workspace-id': workspaceId } : {}),
    ...(admin ? { 'x-test-admin': 'true' } : {}),
  });

  const request = (
    requestInstallId: string,
    workspaceId?: string,
    admin = false,
    outsider = false,
  ): Promise<FixtureRequestResult> => {
    const response = app.inject({
      method: 'GET',
      url: `/api/v1/plugins/${requestInstallId}/proxy/context`,
      headers: {
        ...proxyHeaders(workspaceId, admin),
        ...(outsider ? { 'x-test-outsider': 'true' } : {}),
      },
    });
    return Promise.race([
      response,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Proxy request timed out after ${forwarded.count} forwards`)),
          10_000,
        ),
      ),
    ]);
  };

  const expectDenied = async (task: () => Promise<FixtureRequestResult>): Promise<void> => {
    const before = forwarded.count;
    expect((await task()).statusCode).toBeGreaterThanOrEqual(400);
    expect(forwarded.count).toBe(before);
  };

  return { authStub, proxyHeaders, request, expectDenied };
}

export function createBackend(): {
  backend: ReturnType<typeof createServer>;
  forwarded: { count: number };
  port: () => number;
  close: () => Promise<void>;
} {
  const forwarded = { count: 0 };
  const backend = createServer((request, response) => {
    forwarded.count++;
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        role: request.headers['x-plexica-user-role'],
        workspaceId: request.headers['x-plexica-workspace-id'],
      }),
    );
  });
  return {
    backend,
    forwarded,
    port: () => (backend.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => backend.close(() => resolve())),
  };
}