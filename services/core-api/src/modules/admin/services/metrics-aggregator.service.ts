// metrics-aggregator.service.ts
// Scheduled job that aggregates user/workspace counts across all tenant
// schemas into Redis. The dashboard (dashboard.service.ts) reads the
// resulting keys to avoid a live cross-schema COUNT on every request.
// Implements: Spec 005, Feature 005-01 (S5-B00).

import { prisma } from '../../../lib/database.js';
import { logger } from '../../../lib/logger.js';
import { redis } from '../../../lib/redis.js';
import { toSchemaName } from '../../../lib/tenant-schema-helpers.js';

const SCHEMA_NAME_REGEX = /^tenant_[a-z0-9_]+$/;
const USER_COUNT_KEY = 'metrics:user_count:total';
const WORKSPACE_COUNT_KEY = 'metrics:workspace_count:total';
const DEFAULT_INTERVAL_MS = 300_000; // 5 minutes

type CountRow = { count: number };
type TenantSlugRow = { slug: string };

interface TenantCounts {
  slug: string;
  users: number;
  workspaces: number;
}

/**
 * Count users and workspaces in a single tenant schema. Schema name is
 * validated against SCHEMA_NAME_REGEX (defence-in-depth) before being
 * interpolated — it is derived from the stored slug, never user input.
 * Errors are thrown so the caller can settle them per-tenant.
 */
async function countTenant(schemaName: string): Promise<{
  users: number;
  workspaces: number;
}> {
  const [userRows, workspaceRows] = await Promise.all([
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*)::int AS count FROM "${schemaName}".user_profile`
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*)::int AS count FROM "${schemaName}".workspace`
    ),
  ]);
  return {
    users: userRows[0]?.count ?? 0,
    workspaces: workspaceRows[0]?.count ?? 0,
  };
}

/**
 * Aggregate user and workspace counts across all non-deleted tenant
 * schemas and persist the totals to Redis. Per-tenant failures (e.g. a
 * schema whose tables have not been migrated yet) are logged and skipped
 * — they never abort the whole aggregation.
 */
export async function aggregateMetrics(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { status: { not: 'deleted' } },
    select: { slug: true },
  });

  const slugRows: TenantSlugRow[] = tenants.map((t) => ({ slug: t.slug }));

  const results = await Promise.allSettled(
    slugRows.map(async ({ slug }): Promise<TenantCounts> => {
      const schemaName = toSchemaName(slug);
      if (!SCHEMA_NAME_REGEX.test(schemaName)) {
        throw new Error(`Invalid derived schema name for slug "${slug}": ${schemaName}`);
      }
      const counts = await countTenant(schemaName);
      return { slug, ...counts };
    })
  );

  let totalUsers = 0;
  let totalWorkspaces = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      totalUsers += result.value.users;
      totalWorkspaces += result.value.workspaces;
    } else {
      failed += 1;
      logger.warn(
        { err: result.reason },
        'Metrics aggregator: tenant count skipped (schema may not have tables yet)'
      );
    }
  }

  await redis.set(USER_COUNT_KEY, String(totalUsers));
  await redis.set(WORKSPACE_COUNT_KEY, String(totalWorkspaces));

  logger.info(
    { tenants: slugRows.length, totalUsers, totalWorkspaces, failed },
    'Metrics aggregator: totals written to Redis'
  );
}

/**
 * Start the metrics aggregator: run once immediately, then on a fixed
 * interval. Returns the interval handle for cleanup. Errors in the
 * scheduled tick are caught and logged so the process never crashes.
 */
export function startMetricsAggregator(
  intervalMs: number = DEFAULT_INTERVAL_MS
): NodeJS.Timeout {
  const tick = async (): Promise<void> => {
    try {
      await aggregateMetrics();
    } catch (err) {
      logger.error({ err }, 'Metrics aggregator tick failed');
    }
  };

  void tick();
  return setInterval(() => void tick(), intervalMs);
}
