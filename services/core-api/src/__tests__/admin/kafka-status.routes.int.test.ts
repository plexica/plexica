// kafka-status.routes.int.test.ts
// Integration tests — GET /api/v1/admin/system/kafka (S5-901 / Feature 005-09).
// DLQ counts come from core.dead_letter_queue (real DB); consumer lag comes
// from the in-memory lag-metrics service (seeded via updateLag — no real Kafka
// connection is made by the endpoint itself). Auth/tenant stubbed.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { kafkaStatusRoutes } from '../../modules/admin/routes/kafka-status.routes.js';
import { createTestServer, isDbReachable, makeFullStub } from '../helpers/server.helpers.js';
import {
  clearLagMetrics,
  updateLag,
} from '../../modules/plugin/events/lag-metrics.service.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const mockTenantContext: TenantContext = {
  slug: 'system', schemaName: 'core', realmName: 'master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

let server: FastifyInstance;
let pluginId: string;
const PLUGIN_SLUG = 'test-kafka-plugin';
const INSTALL_ID = 'test-kafka-install-1';
const INSTALL_ID_2 = 'test-kafka-install-2';

beforeAll(async () => {
  if (!(await isDbReachable())) {
    throw new Error('Database is not reachable — ensure PostgreSQL is running.');
  }

  const row = await prisma.plugin.create({
    data: {
      slug: PLUGIN_SLUG,
      name: PLUGIN_SLUG,
      version: '1.0.0',
      author: 'Test',
      categories: [],
      manifest: {},
      status: 'published',
      registryUrl: 'https://registry.example.com',
      imageName: PLUGIN_SLUG,
      imageTag: '1.0.0',
      createdByKeycloakId: SUPER_ADMIN_ACTOR,
    },
    select: { id: true },
  });
  pluginId = row.id;

  // Seed 3 pending DLQ entries linked to the plugin.
  for (let i = 0; i < 3; i++) {
    await prisma.deadLetterQueue.create({
      data: {
        eventType: 'plexica.plugin.test',
        payload: { idx: i },
        pluginId,
        errorMessage: 'boom',
        status: 'pending',
      },
    });
  }
  // One resolved DLQ entry — must NOT count toward pending totals.
  await prisma.deadLetterQueue.create({
    data: { eventType: 'plexica.plugin.test', payload: {}, pluginId, status: 'resolved' },
  });

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, mockTenantContext, ['super_admin']));
  await server.register(kafkaStatusRoutes, { prefix: '/api/v1/admin' });
  await server.ready();
});

afterAll(async () => {
  clearLagMetrics(INSTALL_ID);
  clearLagMetrics(INSTALL_ID_2);
  if (server) await server.close();
  if (pluginId) {
    await prisma.deadLetterQueue.deleteMany({ where: { pluginId } });
    await prisma.plugin.deleteMany({ where: { slug: PLUGIN_SLUG } });
  }
});

afterEach(() => {
  clearLagMetrics(INSTALL_ID);
  clearLagMetrics(INSTALL_ID_2);
});

describe('Kafka Status — GET /api/v1/admin/system/kafka', () => {
  it('returns brokers, consumerLags and dlqDepth with the expected shape', async () => {
    updateLag(INSTALL_ID, PLUGIN_SLUG, 'acme', 50);
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/system/kafka' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.brokers).toBeInstanceOf(Array);
    expect(body.consumerLags).toBeInstanceOf(Array);
    expect(typeof body.dlqDepth).toBe('number');
  });

  it('consumerLags contain the correct pluginSlug, consumerGroup and lag values', async () => {
    updateLag(INSTALL_ID, PLUGIN_SLUG, 'acme', 120);
    updateLag(INSTALL_ID_2, PLUGIN_SLUG, 'globex', 80);
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/system/kafka' });
    const body = JSON.parse(res.payload);
    expect(body.consumerLags).toHaveLength(2);

    // Order-independent matching via consumerGroup (distinguishes acme vs globex).
    const byGroup = new Map<string, { pluginSlug: string; consumerGroup: string; lag: number }>(
      body.consumerLags.map(
        (c: { pluginSlug: string; consumerGroup: string; lag: number }) => [c.consumerGroup, c] as const
      )
    );

    const acme = byGroup.get(`plexica.plugin.${PLUGIN_SLUG}-acme`);
    expect(acme).toBeDefined();
    expect(acme!.pluginSlug).toBe(PLUGIN_SLUG);
    expect(acme!.lag).toBe(120);

    const globex = byGroup.get(`plexica.plugin.${PLUGIN_SLUG}-globex`);
    expect(globex).toBeDefined();
    expect(globex!.pluginSlug).toBe(PLUGIN_SLUG);
    expect(globex!.lag).toBe(80);
  });

  it('dlqDepth counts pending DLQ entries across all plugins', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/system/kafka' });
    const body = JSON.parse(res.payload);
    // 3 pending DLQ entries seeded for PLUGIN_SLUG + 1 resolved (excluded)
    expect(body.dlqDepth).toBe(3);
  });
});
