// basic-health-routes.test.ts
// Unit tests for the public liveness routes (GET /health, GET /api/v1/health).
// The /api/v1 twin exists because the CI runtime contract flow probes Core
// through the same-origin /api/* proxy (run 32830351048): only /api/* is
// forwarded, so the payload must be reachable at an /api-prefixed path.
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { basicHealthPayload, basicHealthRoutes } from '../../modules/health/basic-health-routes.js';

import type { RouteOptions } from 'fastify';

describe('basic health routes', () => {
  it('exposes identical payloads on /health and /api/v1/health without auth', async () => {
    const server = Fastify({ logger: false });
    await server.register(basicHealthRoutes);
    await server.ready();

    const expected = { status: 'ok', version: '2.0.0' };
    expect(basicHealthPayload()).toEqual(expected);

    // No Authorization header is sent — both routes must answer 200.
    for (const url of ['/health', '/api/v1/health?contract=ordinary']) {
      const res = await server.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
      expect(res.json(), url).toEqual(expected);
    }
  });

  it('registers both routes public: rate limiting disabled, no auth preHandler', async () => {
    const server = Fastify({ logger: false });
    const registered: RouteOptions[] = [];
    server.addHook('onRoute', (route) => {
      registered.push(route);
    });
    await server.register(basicHealthRoutes);
    await server.ready();

    // onRoute fires once per registration pass and again on ready — dedupe by URL.
    const routes = [...new Map(registered.map((route) => [route.url, route])).values()];
    expect(routes.map((route) => route.url)).toEqual(['/health', '/api/v1/health']);
    for (const route of routes) {
      expect(route.config?.rateLimit, route.url).toBe(false);
      expect(route.preHandler, route.url).toBeUndefined();
      expect(route.onRequest, route.url).toBeUndefined();
    }
  });
});
