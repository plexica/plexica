// plugin-health-observability.int.test.ts — integration test for the breaker
// → observability wiring against real PostgreSQL and Redis:
//   1. three recordFailure() calls open the breaker for a seeded installation,
//   2. the transition persists health_status='degraded' in the tenant schema
//      and writes the Redis health gauge (with TTL),
//   3. the GDPR deletion patterns erase every observability key.
// Uses real services end-to-end — no mocks (AGENTS.md §Testing).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { deleteRedisKeysByPatterns, redis } from '../lib/redis.js';
import { recordFailure, resetBreaker } from '../modules/plugin/services/health-check.service.js';
import {
  noteInstallationTenant,
  registerHealthObservability,
} from '../modules/plugin/services/health-observability.service.js';
import { redisPatterns } from '../modules/admin/services/deletion-step-gdpr-purge.js';

import { poll } from './helpers/deletion.helpers.js';
import { buildTenantClientForCtx, cleanupTenant, seedTenant } from './helpers/db.helpers.js';
import { isDbReachable, isRedisReachable } from './helpers/server.helpers.js';

import type { TenantContext } from '../lib/tenant-context-store.js';

const SLUG = `healthobs-${process.pid}`;
const PLUGIN_SLUG = `healthobs-fixture-${process.pid}`;
const stackUp = (await isDbReachable()) && (await isRedisReachable());
const skipIfNoStack = it.skipIf(!stackUp);

let context: TenantContext;
let tenantId: string;
let installId: string;
let pluginId: string;

const gaugeKey = () => `metrics:${SLUG}:plugin_health:${installId}`;
const mapKey = () => `plugin:health-tenant:${installId}`;
const cbKey = () => `plugin:cb:${installId}`;

beforeAll(async () => {
  if (!stackUp) return;
  ({ tenantContext: context, tenantId } = await seedTenant(SLUG));
  const plugin = await prisma.plugin.create({
    data: {
      slug: PLUGIN_SLUG, name: 'Health observability fixture', version: '1.0.0',
      author: 'Plexica', registryUrl: 'https://registry.example.invalid',
      imageName: 'healthobs-fixture', imageTag: '1.0.0', createdByKeycloakId: 'integration-test',
    },
  });
  pluginId = plugin.id;
  const tenantDb = buildTenantClientForCtx(context);
  installId = (await tenantDb.pluginInstallation.create({
    data: {
      pluginId, tenantSlug: SLUG, version: '1.0.0', status: 'active',
      hostingType: 'sidecar', installedBy: '00000000-0000-4000-8000-000000000099',
      containerCfg: { create: { image: 'healthobs-fixture:1.0.0' } },
    },
  })).id;
  await tenantDb.$disconnect();
  registerHealthObservability();
});

afterAll(async () => {
  if (!stackUp) return;
  await resetBreaker(installId).catch(() => {});
  await redis.del(gaugeKey(), mapKey(), cbKey()).catch(() => {});
  await prisma.plugin.deleteMany({ where: { id: pluginId } }).catch(() => {});
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

describe('plugin health observability wiring', () => {
  skipIfNoStack('breaker transition persists health_status and writes the gauge', async () => {
    // Simulate the proxy's per-request attribution (fire-and-forget in prod).
    noteInstallationTenant(installId, SLUG);
    await poll(() => redis.get(mapKey()), (value) => value === SLUG, 10_000);

    for (let attempt = 0; attempt < 3; attempt++) await recordFailure(installId);

    const tenantDb = buildTenantClientForCtx(context);
    const row = await poll(
      () => tenantDb.pluginContainerConfig.findUnique({ where: { installId } }),
      (config) => config?.healthStatus === 'degraded',
      10_000
    );
    expect(row?.healthStatus).toBe('degraded');
    expect(row?.lastHealthCheckAt).not.toBeNull();
    await tenantDb.$disconnect();

    expect(await redis.get(gaugeKey())).toBe('0');
    const ttl = await redis.ttl(gaugeKey());
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(86_400);
  });

  skipIfNoStack('GDPR deletion patterns erase every observability key', async () => {
    expect(await redis.get(gaugeKey())).not.toBeNull();
    expect(await redis.get(mapKey())).not.toBeNull();
    expect(await redis.get(cbKey())).not.toBeNull();

    await deleteRedisKeysByPatterns(
      redis,
      redisPatterns(tenantId, {
        tenantSlug: SLUG,
        schemaName: context.schemaName,
        realmName: context.realmName,
        bucketName: `tenant-${SLUG}`,
        pluginInstallIds: [installId],
      })
    );

    expect(await redis.mget(gaugeKey(), mapKey(), cbKey())).toEqual([null, null, null]);
  });
});
