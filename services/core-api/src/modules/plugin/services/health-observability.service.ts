// services/health-observability.service.ts
// Wires circuit-breaker health transitions (health-check.service.ts) to their
// two observability sinks:
//
//   1. PERSISTENCE — plugin_container_config.health_status +
//      last_health_check_at in the owning tenant schema (spec 004 §data
//      model: healthy/degraded/unreachable).
//   2. METRICS — Redis gauge `metrics:{tenantSlug}:plugin_health:{installId}`
//      (1=healthy, 0=degraded, -1=down), the store the planned Prometheus
//      exporter will read (plan §9.9 plexica_plugin_health_status), same
//      pattern as the admin metrics aggregator's `metrics:*` keys. The key is
//      namespaced under `metrics:{tenantSlug}:` so the GDPR purge pattern
//      (`metrics:{tenantSlug}:*`) covers it, and carries a 24h TTL refreshed
//      on every transition as a safety net.
//
// The breaker only notifies an installId, so the owning tenant is resolved
// from two sources, in order:
//   a. a Redis map (`plugin:health-tenant:{installId}` → tenantSlug) refreshed
//      by the proxy on every request — covers proxy-driven transitions,
//   b. the active Kafka consumer group names (`plugin-{installId}-{tenantSlug}`)
//      — covers poller-driven transitions for installations that subscribe to
//      events but were never proxied.
// Dev-mode backends (installId = plugin slug, no installation row) are not
// attributable and are skipped at debug level.
//
// Registration is explicit and idempotent; proxy.service.ts performs it at
// module load (the proxy is the primary driver of breaker transitions, and a
// listener registration — unlike a timer — is inert until a transition fires).

import { prisma } from '../../../lib/database.js';
import { logger } from '../../../lib/logger.js';
import { redis } from '../../../lib/redis.js';
import { withTenantDb } from '../../../lib/tenant-database.js';
import { toRealmName, toSchemaName } from '../../../lib/tenant-schema-helpers.js';
import { getActiveConsumerGroups, parseConsumerGroupName } from '../events/consumer-manager.service.js';

import { onHealthChange, removeHealthChangeHandler } from './health-check.service.js';

import type { HealthChangeHandler } from './health-check.service.js';
import type { HealthStatus } from './container-manager.service.js';
import type { TenantContext } from '../../../lib/tenant-context-store.js';

const TENANT_MAP_PREFIX = 'plugin:health-tenant:';
const TENANT_MAP_TTL_SECONDS = 86_400; // mirrors the circuit-breaker TTL
const GAUGE_TTL_SECONDS = 86_400; // 24h safety net — refreshed on every transition
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** plan §9.9: 1=healthy, 0=degraded, -1=down. */
const GAUGE_VALUES: Record<HealthStatus, number> = {
  healthy: 1,
  degraded: 0,
  unreachable: -1,
};

interface ResolvedInstallation {
  installId: string;
  tenantSlug: string;
}

/** GDPR-purgeable gauge key — matches the `metrics:{tenantSlug}:*` pattern. */
function gaugeKey(tenantSlug: string, installId: string): string {
  return `metrics:${tenantSlug}:plugin_health:${installId}`;
}

/**
 * Records which tenant owns an installation. Called by the proxy on every
 * request; fire-and-forget — observability bookkeeping must never slow down
 * or fail the proxied request.
 */
export function noteInstallationTenant(installId: string, tenantSlug: string): void {
  if (!UUID_RE.test(installId)) return; // dev backends use the plugin slug
  redis
    .set(`${TENANT_MAP_PREFIX}${installId}`, tenantSlug, 'EX', TENANT_MAP_TTL_SECONDS)
    .catch((err: unknown) =>
      logger.warn({ err, installId }, 'Failed to record installation tenant')
    );
}

async function resolveInstallation(installId: string): Promise<ResolvedInstallation | null> {
  if (UUID_RE.test(installId)) {
    const mapped = await redis.get(`${TENANT_MAP_PREFIX}${installId}`);
    if (mapped !== null && mapped.length > 0) return { installId, tenantSlug: mapped };
  }
  for (const group of getActiveConsumerGroups()) {
    const parsed = parseConsumerGroupName(group);
    if (parsed === null) continue;
    // Exact match only: the parser now emits full UUIDs by construction, so
    // any shorter input is a non-UUID dev-backend slug — and a hex-only slug
    // that prefixes a real installation UUID would misattribute a transition
    // across tenants. The pre-fix truncation path no longer exists.
    if (parsed.installId === installId) {
      return parsed;
    }
  }
  return null;
}

async function persistHealthChange(installId: string, newStatus: HealthStatus): Promise<void> {
  const resolved = await resolveInstallation(installId);
  if (!resolved) {
    logger.debug(
      { installId, newStatus },
      'Plugin health change not attributable to a tenant — skipped'
    );
    return;
  }

  // Metrics sink first: each sink degrades independently — a gauge write
  // failure must not block persistence, nor the other way around.
  await redis
    .set(
      gaugeKey(resolved.tenantSlug, resolved.installId),
      String(GAUGE_VALUES[newStatus]),
      'EX',
      GAUGE_TTL_SECONDS
    )
    .catch((err: unknown) =>
      logger.warn({ err, ...resolved }, 'Failed to write plugin health gauge')
    );

  const tenant = await prisma.tenant.findUnique({
    where: { slug: resolved.tenantSlug },
    select: { id: true },
  });
  if (!tenant) {
    logger.warn({ ...resolved }, 'Plugin health change references unknown tenant — skipped');
    return;
  }

  const context: TenantContext = {
    tenantId: tenant.id,
    slug: resolved.tenantSlug,
    schemaName: toSchemaName(resolved.tenantSlug),
    realmName: toRealmName(resolved.tenantSlug),
  };
  // updateMany (not update): installations without a container config row
  // must not turn a health transition into a thrown P2025.
  const result = await withTenantDb(
    (db) =>
      db.pluginContainerConfig.updateMany({
        where: { installId: resolved.installId },
        data: { healthStatus: newStatus, lastHealthCheckAt: new Date() },
      }),
    context
  );

  logger.info(
    { ...resolved, newStatus, persisted: result.count > 0 },
    'Plugin health change recorded'
  );
}

const onTransition: HealthChangeHandler = (installId, _oldStatus, newStatus) => {
  persistHealthChange(installId, newStatus).catch((err: unknown) =>
    logger.error({ err, installId, newStatus }, 'Failed to record plugin health change')
  );
};

let registered = false;

/** Registers the health-change consumer. Idempotent. */
export function registerHealthObservability(): void {
  if (registered) return;
  onHealthChange(onTransition);
  registered = true;
}

/** Removes the health-change consumer (shutdown symmetry, tests). */
export function unregisterHealthObservability(): void {
  if (!registered) return;
  removeHealthChangeHandler(onTransition);
  registered = false;
}
