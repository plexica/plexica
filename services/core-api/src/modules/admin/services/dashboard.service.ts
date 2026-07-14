// dashboard.service.ts
// Aggregates platform-wide metrics for the super-admin dashboard.
// Implements: Spec 005, Feature 005-01 (S5-B00 / dashboard overview).
//
// Tenant/plugin/DLQ counts come from the core schema via parallel Prisma
// count queries. Health status is derived from checkHealth() — the worst
// service status wins (down > degraded > healthy).
//
// totalUsers and workspaceCount are cross-schema aggregates: each tenant
// stores its users and workspaces in its own schema, so a live count would
// require iterating every tenant schema. Until the scheduled aggregator
// job (S5-B00 spec §scheduled) populates the Redis keys
// `metrics:user_count:total` and `metrics:workspace_count:total`, these
// values fall back to 0. The aggregator job is tracked separately in the
// plan and is a hard prerequisite for accurate cross-schema totals.

import type { PrismaClient } from '@prisma/client';

import { redis } from '../../../lib/redis.js';
import { checkHealth } from './health-checker.service.js';

import type { DashboardMetrics } from '../schemas/dashboard-schemas.js';
import type { HealthStatus } from '../schemas/health-schemas.js';

const USER_COUNT_KEY = 'metrics:user_count:total';
const WORKSPACE_COUNT_KEY = 'metrics:workspace_count:total';

/** Worst-status-wins: down > degraded > healthy. */
const STATUS_RANK: Record<HealthStatus, number> = {
  healthy: 0,
  degraded: 1,
  down: 2,
};

function deriveHealthStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.length === 0) return 'healthy';
  return statuses.reduce<HealthStatus>(
    (worst, current) =>
      STATUS_RANK[current] > STATUS_RANK[worst] ? current : worst,
    'healthy'
  );
}

async function readRedisInt(key: string): Promise<number> {
  const raw = await redis.get(key);
  if (raw === null) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function getDashboardMetrics(
  prisma: PrismaClient
): Promise<DashboardMetrics> {
  const [
    tenantCount,
    activeTenantCount,
    suspendedTenantCount,
    pendingDeletionCount,
    pluginCount,
    activePluginCount,
    dlqDepth,
    totalUsers,
    workspaceCount,
    health,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: 'active' } }),
    prisma.tenant.count({ where: { status: 'suspended' } }),
    prisma.tenant.count({ where: { status: 'pending_deletion' } }),
    prisma.plugin.count(),
    prisma.plugin.count({ where: { status: 'published' } }),
    prisma.deadLetterQueue.count({ where: { status: 'pending' } }),
    readRedisInt(USER_COUNT_KEY),
    readRedisInt(WORKSPACE_COUNT_KEY),
    checkHealth(),
  ]);

  const healthStatus = deriveHealthStatus(
    health.services.map((s) => s.status)
  );

  return {
    tenantCount,
    activeTenantCount,
    suspendedTenantCount,
    pendingDeletionCount,
    pluginCount,
    activePluginCount,
    totalUsers,
    workspaceCount,
    dlqDepth,
    healthStatus,
  };
}
