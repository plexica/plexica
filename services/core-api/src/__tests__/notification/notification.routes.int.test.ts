// notification.routes.int.test.ts
// INT: notification routes (006-01/02/04) on a real stack — DB + real HTTP:
// SSE, 401, list, mark read, read-all, prefs NFR, types, 422 validation.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { notificationModuleRoutes } from '../../modules/notification/index.js';
import { connectionManager } from '../../modules/notification/connection-manager.js';
import { authMiddleware } from '../../middleware/auth-middleware.js';
import { tenantContextMiddleware } from '../../middleware/tenant-context.js';
import { userProfileResolver } from '../../middleware/user-profile-resolver.js';
import { cleanupTenant, seedTenant, seedUserProfile } from '../helpers/db.helpers.js';
import { createTestServer, isDbReachable, makeFullStub } from '../helpers/server.helpers.js';

import { seedNotification } from './notification.int.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SLUG = 'notif-int-routes';
const SLUG_B = 'notif-int-routes-b';
const ADMIN_ID = '00000000-0301-0001-0000-000000000001';

const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let server: FastifyInstance;
let ctx: TenantContext;
let baseUrl: string;

beforeAll(async () => {
  const seededA = await seedTenant(SLUG);
  await seedTenant(SLUG_B);
  ctx = seededA.tenantContext;
  await seedUserProfile(ctx, ADMIN_ID, `${ADMIN_ID}@test.plexica.io`, 'Admin User', ADMIN_ID);

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(ADMIN_ID, ctx, ['tenant_admin']));
  await server.register(notificationModuleRoutes);
  await server.listen({ port: 0, host: '127.0.0.1' });
  const address = server.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${String(port)}`;
});

afterAll(async () => {
  await server.close();
  await cleanupTenant(SLUG);
  await cleanupTenant(SLUG_B);
  await prisma.$disconnect();
});

describe('notification routes (INT)', () => {
  skipIfNoDb('GET /notifications lists the caller rows', async () => {
    const id = await seedNotification(ctx, ADMIN_ID);
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/notifications?page=1&pageSize=20&filter=all',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: Array<{ id: string }>; total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.data.some((n) => n.id === id)).toBe(true);
  });

  skipIfNoDb('GET /notifications rejects a bad query with 422 VALIDATION_ERROR', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/notifications?page=0&pageSize=20&filter=bogus',
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body)).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  skipIfNoDb('PATCH /notifications/:id/read marks the row read; unknown id → 404', async () => {
    const id = await seedNotification(ctx, ADMIN_ID);
    const res = await server.inject({ method: 'PATCH', url: `/api/v1/notifications/${id}/read` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ id, read: true });

    const missing = await server.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/00000000-0000-0000-0000-000000000000/read',
    });
    expect(missing.statusCode).toBe(404);

    const badId = await server.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/not-a-uuid/read',
    });
    expect(badId.statusCode).toBe(422);
    expect(JSON.parse(badId.body)).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  skipIfNoDb('POST /notifications/read-all returns the updated count', async () => {
    await seedNotification(ctx, ADMIN_ID);
    const res = await server.inject({ method: 'POST', url: '/api/v1/notifications/read-all' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { updated: number };
    expect(typeof body.updated).toBe('number');
  });

  skipIfNoDb(
    'GET/PATCH /notifications/preferences round-trips under 300ms (NFR-006-6)',
    async () => {
      const started = Date.now();
      const patch = await server.inject({
        method: 'PATCH',
        url: '/api/v1/notifications/preferences',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaults: { inApp: true, email: true } }),
      });
      expect(patch.statusCode).toBe(200);
      expect(Date.now() - started).toBeLessThan(300);

      const get = await server.inject({ method: 'GET', url: '/api/v1/notifications/preferences' });
      expect(get.statusCode).toBe(200);
      expect(JSON.parse(get.body)).toMatchObject({ defaults: { inApp: true, email: true } });

      const bad = await server.inject({
        method: 'PATCH',
        url: '/api/v1/notifications/preferences',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaults: { inApp: 'yes', email: true } }),
      });
      expect(bad.statusCode).toBe(422);
      expect(JSON.parse(bad.body)).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
  );

  skipIfNoDb('GET /notifications/types returns the core type registry', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/notifications/types' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { types: Array<{ key: string; channels: string[] }> };
    expect(body.types.some((t) => t.key === 'workspace.invite')).toBe(true);
  });
});

describe('notification stream (INT, real HTTP)', () => {
  skipIfNoDb('connects in < 1s and delivers a pushed frame', async () => {
    const controller = new AbortController();
    const started = Date.now();
    const response = await fetch(`${baseUrl}/api/v1/notifications/stream`, {
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(Date.now() - started).toBeLessThan(1_000);

    const reader = response.body?.getReader();
    const received = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SSE frame timeout')), 2_000);
      void (async () => {
        if (!reader) {
          reject(new Error('No response body'));
          return;
        }
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.includes('event: notification')) {
            clearTimeout(timer);
            resolve();
            return;
          }
        }
      })();
    });

    const dto = {
      id: crypto.randomUUID(),
      type: 'workspace.invite',
      titleKey: 'notifications.workspace.invite.title',
      bodyKey: null,
      metadata: {},
      read: false,
      createdAt: new Date().toISOString(),
    };
    expect(connectionManager.publish(ctx.slug, ADMIN_ID, dto)).toBe(true);
    await received;
    controller.abort();
  });

  skipIfNoDb('returns 401 without authentication (production composition)', async () => {
    const guardServer = await createTestServer();
    guardServer.addHook('preHandler', authMiddleware);
    guardServer.addHook('preHandler', tenantContextMiddleware);
    guardServer.addHook('preHandler', userProfileResolver);
    await guardServer.register(notificationModuleRoutes);
    await guardServer.ready();

    const res = await guardServer.inject({ method: 'GET', url: '/api/v1/notifications/stream' });
    expect(res.statusCode).toBe(401);
    await guardServer.close();
  });
});
