import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { kafkaStatusRoutes } from '../../modules/admin/routes/kafka-status.routes.js';
import {
  SUPER_ADMIN_ACTOR,
  createAdminTestServer,
  isDbReachable,
} from '../helpers/server.helpers.js';
import { clearLagMetrics, updateLag } from '../../modules/plugin/events/lag-metrics.service.js';

import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;
let pluginId: string;
let pluginId2: string;
let tenantId: string;
let pendingDlqBaseline: number;
const PLUGIN_SLUG = 'test-kafka-plugin';
const PLUGIN_SLUG_2 = 'test-kafka-plugin-2';
const INSTALL_ID = 'test-kafka-install-1';
const INSTALL_ID_2 = 'test-kafka-install-2';

function dlqData(currentPluginId: string, index: number, status = 'pending') {
  const eventId = crypto.randomUUID();
  const installId = crypto.randomUUID();
  return {
    tenantId,
    installId,
    eventId,
    eventType: 'plexica.plugin.test',
    schemaVersion: 1,
    payload: {
      eventId,
      type: 'plexica.plugin.test',
      schemaVersion: 1,
      tenantId,
      occurredAt: new Date().toISOString(),
      producer: { kind: 'core', id: 'core' },
      correlationId: eventId,
      causationId: null,
      payload: { idx: index },
    },
    pluginId: currentPluginId,
    errorMessage: 'TEST_FAILURE',
    retryCount: 0,
    originalTopic: 'plexica.plugin.test',
    originalPartition: 0,
    originalOffset: BigInt(index),
    dedupeKey: eventId.replaceAll('-', '').padEnd(64, '0'),
    status,
  };
}

beforeAll(async () => {
  if (!(await isDbReachable())) {
    throw new Error('Database is not reachable — ensure PostgreSQL is running.');
  }

  pendingDlqBaseline = await prisma.deadLetterQueue.count({ where: { status: 'pending' } });
  const tenant = await prisma.tenant.create({
    data: { slug: `kafka-test-${crypto.randomUUID().slice(0, 8)}`, name: 'Kafka Test' },
  });
  tenantId = tenant.id;

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
    await prisma.deadLetterQueue.create({ data: dlqData(pluginId, i) });
  }
  // One resolved DLQ entry — must NOT count toward pending totals.
  await prisma.deadLetterQueue.create({ data: dlqData(pluginId, 10, 'dismissed') });

  // Second plugin with its own DLQ entries (exercises cross-plugin aggregation).
  const row2 = await prisma.plugin.create({
    data: {
      slug: PLUGIN_SLUG_2,
      name: PLUGIN_SLUG_2,
      version: '1.0.0',
      author: 'Test',
      categories: [],
      manifest: {},
      status: 'published',
      registryUrl: 'https://registry.example.com',
      imageName: PLUGIN_SLUG_2,
      imageTag: '1.0.0',
      createdByKeycloakId: SUPER_ADMIN_ACTOR,
    },
    select: { id: true },
  });
  pluginId2 = row2.id;

  // Seed 2 pending DLQ entries for the second plugin.
  for (let i = 0; i < 2; i++) {
    await prisma.deadLetterQueue.create({ data: dlqData(pluginId2, i + 20) });
  }

  server = await createAdminTestServer([kafkaStatusRoutes]);
});

afterAll(async () => {
  clearLagMetrics(INSTALL_ID);
  clearLagMetrics(INSTALL_ID_2);
  if (server) await server.close();
  if (pluginId) {
    await prisma.deadLetterQueue.deleteMany({ where: { pluginId } });
    await prisma.plugin.deleteMany({ where: { slug: PLUGIN_SLUG } });
  }
  if (pluginId2) {
    await prisma.deadLetterQueue.deleteMany({ where: { pluginId: pluginId2 } });
    await prisma.plugin.deleteMany({ where: { slug: PLUGIN_SLUG_2 } });
  }
  if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
});

afterEach(() => {
  clearLagMetrics(INSTALL_ID);
  clearLagMetrics(INSTALL_ID_2);
});

describe('Kafka Status — GET /api/v1/admin/system/kafka', () => {
  it('returns the canonical KafkaStatusResponse shape (ADR-029)', async () => {
    updateLag(INSTALL_ID, PLUGIN_SLUG, 'acme', 50);
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/system/kafka' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // Canonical shape: { brokers, consumers, totalLag, dlqDepth, activeConsumerGroups }
    expect(body.brokers).toBeInstanceOf(Array);
    expect(body.consumers).toBeInstanceOf(Array);
    expect(typeof body.totalLag).toBe('number');
    expect(typeof body.dlqDepth).toBe('number');
    expect(typeof body.activeConsumerGroups).toBe('number');
    // No legacy fields
    expect(body.consumerLags).toBeUndefined();
  });

  it('consumers contain the correct pluginSlug, tenantSlug, lag and topic', async () => {
    updateLag(INSTALL_ID, PLUGIN_SLUG, 'acme', 120);
    updateLag(INSTALL_ID_2, PLUGIN_SLUG, 'globex', 80);
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/system/kafka' });
    const body = JSON.parse(res.payload);
    expect(body.consumers).toHaveLength(2);
    expect(body.totalLag).toBe(200);

    // Order-independent matching via tenantSlug (distinguishes acme vs globex).
    const byTenant = new Map<string, { pluginSlug: string; lag: number; topic: string }>(
      body.consumers.map(
        (c: { pluginSlug: string; tenantSlug: string | null; lag: number; topic: string }) =>
          [c.tenantSlug ?? '', c] as const
      )
    );

    const acme = byTenant.get('acme');
    expect(acme).toBeDefined();
    expect(acme!.pluginSlug).toBe(PLUGIN_SLUG);
    expect(acme!.lag).toBe(120);
    expect(acme!.topic).toBe(`plexica.plugin.${PLUGIN_SLUG}`);

    const globex = byTenant.get('globex');
    expect(globex).toBeDefined();
    expect(globex!.pluginSlug).toBe(PLUGIN_SLUG);
    expect(globex!.lag).toBe(80);
  });

  it('dlqDepth aggregates pending DLQ entries across all plugins', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/system/kafka' });
    const body = JSON.parse(res.payload);
    // Baseline entries are preserved; 3 + 2 test pending entries count, 1 resolved does not.
    expect(body.dlqDepth).toBe(pendingDlqBaseline + 5);
  });
});
