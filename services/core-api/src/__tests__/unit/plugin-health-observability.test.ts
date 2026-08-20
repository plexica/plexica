// plugin-health-observability.test.ts — unit tests for the breaker →
// observability wiring: tenant attribution (Redis map → consumer group
// fallback), gauge writes (key format + TTL), and tenant-schema persistence.
// This chain had zero coverage, which let the installId-truncation bug ship.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  tenantFindUnique: vi.fn(),
  updateMany: vi.fn(),
  getActiveConsumerGroups: vi.fn(),
  logDebug: vi.fn(),
  logWarn: vi.fn(),
  handlers: new Set<HealthChangeHandler>(),
}));

vi.mock('../../lib/database.js', () => ({
  prisma: { tenant: { findUnique: mocks.tenantFindUnique } },
}));
vi.mock('../../lib/redis.js', () => ({
  redis: { get: mocks.redisGet, set: mocks.redisSet },
}));
vi.mock('../../lib/tenant-database.js', () => ({
  withTenantDb: vi.fn(async (callback: (db: unknown) => Promise<unknown>) =>
    callback({ pluginContainerConfig: { updateMany: mocks.updateMany } })
  ),
}));
// Partial mock: keep the REAL parseConsumerGroupName (single source of truth)
// so the fallback path exercises the actual parsing, stub only the group list.
vi.mock('../../modules/plugin/events/consumer-manager.service.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../modules/plugin/events/consumer-manager.service.js')>();
  return { ...original, getActiveConsumerGroups: mocks.getActiveConsumerGroups };
});
vi.mock('../../modules/plugin/services/health-check.service.js', () => ({
  onHealthChange: vi.fn((handler: HealthChangeHandler) => {
    mocks.handlers.add(handler);
  }),
  removeHealthChangeHandler: vi.fn((handler: HealthChangeHandler) => {
    mocks.handlers.delete(handler);
  }),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: mocks.logWarn, error: vi.fn(), debug: mocks.logDebug },
}));

import { registerHealthObservability } from '../../modules/plugin/services/health-observability.service.js';

import type { HealthChangeHandler } from '../../modules/plugin/services/health-check.service.js';

const INSTALL_ID = '550e8400-e29b-41d4-a716-446655440000';

function fireTransition(installId: string, newStatus: 'healthy' | 'degraded' | 'unreachable'): void {
  for (const handler of mocks.handlers) handler(installId, 'healthy', newStatus);
}

describe('health observability wiring', () => {
  beforeAll(() => registerHealthObservability());

  beforeEach(() => {
    for (const mock of [
      mocks.redisGet, mocks.redisSet, mocks.tenantFindUnique,
      mocks.updateMany, mocks.getActiveConsumerGroups, mocks.logDebug, mocks.logWarn,
    ]) mock.mockReset();
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue('OK');
    mocks.tenantFindUnique.mockResolvedValue({ id: 'tenant-id' });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.getActiveConsumerGroups.mockReturnValue([]);
  });

  it('resolves the tenant from the Redis map and persists status + gauge', async () => {
    mocks.redisGet.mockResolvedValue('acme');
    fireTransition(INSTALL_ID, 'degraded');
    await vi.waitFor(() => expect(mocks.updateMany).toHaveBeenCalled());
    expect(mocks.getActiveConsumerGroups).not.toHaveBeenCalled();
    expect(mocks.redisSet).toHaveBeenCalledWith(
      `metrics:acme:plugin_health:${INSTALL_ID}`, '0', 'EX', 86_400
    );
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { installId: INSTALL_ID },
      data: { healthStatus: 'degraded', lastHealthCheckAt: expect.any(Date) },
    });
  });

  it('falls back to the consumer group name when the Redis map is absent', async () => {
    mocks.getActiveConsumerGroups.mockReturnValue([`plugin-${INSTALL_ID}-acme-corp`]);
    fireTransition(INSTALL_ID, 'unreachable');
    await vi.waitFor(() => expect(mocks.updateMany).toHaveBeenCalled());
    expect(mocks.redisSet).toHaveBeenCalledWith(
      `metrics:acme-corp:plugin_health:${INSTALL_ID}`, '-1', 'EX', 86_400
    );
    expect(mocks.tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: 'acme-corp' }, select: { id: true },
    });
  });

  it('never prefix-matches a non-UUID id to a real installation', async () => {
    // A dev-backend slug or truncated id must NOT be prefix-matched onto a
    // real installation's UUID: that would write health state into the wrong
    // tenant schema. Exact match only.
    mocks.getActiveConsumerGroups.mockReturnValue([`plugin-${INSTALL_ID}-acme`]);
    fireTransition('550e8400', 'degraded'); // truncated — not a UUID
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('skips transitions that cannot be attributed to any tenant', async () => {
    fireTransition(INSTALL_ID, 'degraded');
    await vi.waitFor(() => expect(mocks.logDebug).toHaveBeenCalled());
    expect(mocks.redisSet).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('still writes the gauge when the tenant lookup misses (sinks independent)', async () => {
    mocks.redisGet.mockResolvedValue('ghost');
    mocks.tenantFindUnique.mockResolvedValue(null);
    fireTransition(INSTALL_ID, 'degraded');
    await vi.waitFor(() => expect(mocks.logWarn).toHaveBeenCalled());
    expect(mocks.redisSet).toHaveBeenCalledWith(
      `metrics:ghost:plugin_health:${INSTALL_ID}`, '0', 'EX', 86_400
    );
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('persists to the database even when the gauge write fails', async () => {
    mocks.redisGet.mockResolvedValue('acme');
    mocks.redisSet.mockRejectedValue(new Error('Redis down'));
    fireTransition(INSTALL_ID, 'degraded');
    await vi.waitFor(() => expect(mocks.updateMany).toHaveBeenCalled());
    expect(mocks.logWarn).toHaveBeenCalled();
  });
});
