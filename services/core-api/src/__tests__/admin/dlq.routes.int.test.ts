import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { dlqRoutes } from '../../modules/plugin/routes/dlq.routes.js';
import {
  SUPER_ADMIN_ACTOR,
  createAdminTestServer,
  isDbReachable,
} from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';

const PLUGIN_SLUG = 'test-dlq-pagination-plugin';

// Response envelope of GET /api/v1/admin/system/dlq — mirrors the web client's
// DlqListResponse (apps/web/src/types/plugin.ts); asserted exactly below.
interface DlqListBody {
  data: { id: string; originalOffset: string }[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

let server: FastifyInstance;
let pluginId: string;
let tenantId: string;
const seededIds: string[] = [];

function dlqData(index: number) {
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
    pluginId,
    errorMessage: 'TEST_FAILURE',
    retryCount: 0,
    originalTopic: 'plexica.plugin.test',
    originalPartition: 0,
    originalOffset: BigInt(index),
    dedupeKey: eventId.replaceAll('-', '').padEnd(64, '0'),
    status: 'pending',
  };
}

beforeAll(async () => {
  if (!(await isDbReachable())) {
    throw new Error('Database is not reachable — ensure PostgreSQL is running.');
  }

  const tenant = await prisma.tenant.create({
    data: {
      slug: `dlq-pagination-${crypto.randomUUID().slice(0, 8)}`,
      name: 'DLQ Pagination Test',
    },
  });
  tenantId = tenant.id;

  const plugin = await prisma.plugin.create({
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
  pluginId = plugin.id;

  // 3 pending entries — enough to overflow a pageSize=2 page. The pluginId
  // filter in the queries below isolates them from other suites' DLQ rows.
  for (let i = 0; i < 3; i++) {
    const entry = await prisma.deadLetterQueue.create({ data: dlqData(i), select: { id: true } });
    seededIds.push(entry.id);
  }

  // rootRoutes: the plugin declares its full /api/v1 path, as in production.
  server = await createAdminTestServer([], { rootRoutes: [dlqRoutes] });
});

afterAll(async () => {
  if (server) await server.close();
  if (pluginId) {
    await prisma.deadLetterQueue.deleteMany({ where: { pluginId } });
    await prisma.plugin.deleteMany({ where: { slug: PLUGIN_SLUG } });
  }
  if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
});

describe('DLQ — GET /api/v1/admin/system/dlq', () => {
  // Regression guard: the hand-built envelope omitted totalPages, so the web
  // client's `?? 1` fallback kept <Pagination> hidden and page 2+ of the DLQ
  // was unreachable from the UI (same bug class as the /users fix).
  it('returns the exact paginated envelope including totalPages', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/admin/system/dlq?pluginId=${pluginId}&page=1&pageSize=2`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as DlqListBody;
    expect(Object.keys(body).sort()).toEqual(['data', 'page', 'pageSize', 'total', 'totalPages']);
    expect(body).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2 });
    expect(body.data).toHaveLength(2);
    expect(typeof body.data[0]?.originalOffset).toBe('string');
  });

  it('page 2 returns the remaining entries, disjoint from page 1', async () => {
    const getPage = async (page: number): Promise<DlqListBody> => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/admin/system/dlq?pluginId=${pluginId}&page=${page}&pageSize=2`,
      });
      expect(res.statusCode).toBe(200);
      return JSON.parse(res.payload) as DlqListBody;
    };
    const p1 = await getPage(1);
    const p2 = await getPage(2);
    expect(p2).toMatchObject({ total: 3, page: 2, pageSize: 2, totalPages: 2 });
    expect(p2.data).toHaveLength(1);
    const p1Ids = new Set(p1.data.map((e) => e.id));
    expect(p2.data.every((e) => !p1Ids.has(e.id))).toBe(true);
    // Together the two pages cover exactly the seeded entries.
    const allIds = [...p1.data, ...p2.data].map((e) => e.id).sort();
    expect(allIds).toEqual([...seededIds].sort());
  });
});
