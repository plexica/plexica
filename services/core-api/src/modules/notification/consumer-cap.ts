// consumer-cap.ts
// Per-user delivery cap for the notification consumer (F5, ADR-035): 100/min
// per user via Redis counter `notification:{tenantId}:{userId}:emit`. The row
// stays persisted on breach (delivery suppressed) so at-least-once redelivery
// never inflates the counter. Fail-open on Redis outage (ADR-012). Split from
// consumer-pipeline.ts for the 200-line gate (Rule 4).

import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import { toRealmName, toSchemaName } from '../../lib/tenant-schema-helpers.js';
import { withCoreDb } from '../../lib/tenant-database.js';

import { incrementRateLimited } from './consumer-metrics.js';

import type { DomainEventEnvelope } from '../../events/event-envelope.js';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const CAP_KEY_PREFIX = 'notification:';
const CAP_WINDOW_SECONDS = 60;

/**
 * Resolves the active tenant context for an event, or null when the tenant is
 * not active (skip — nothing to deliver, mirrors the plugin consumer filter).
 */
export async function resolveActiveTenantContext(
  event: DomainEventEnvelope
): Promise<TenantContext | null> {
  const tenant = await withCoreDb((db) =>
    db.tenant.findUnique({
      where: { id: event.tenantId },
      select: { slug: true, status: true },
    })
  );
  if (!tenant || tenant.status !== 'active') return null;
  return {
    tenantId: event.tenantId,
    slug: tenant.slug,
    schemaName: toSchemaName(tenant.slug),
    realmName: toRealmName(tenant.slug),
  };
}

/** Returns true when the per-user 100/min cap is breached (delivery suppressed). */
export async function isUserRateLimited(tenantId: string, userId: string): Promise<boolean> {
  const key = `${CAP_KEY_PREFIX}${tenantId}:${userId}:emit`;
  try {
    const results = (await redis
      .multi()
      .incr(key)
      .expire(key, CAP_WINDOW_SECONDS, 'NX')
      .exec()) as Array<[Error | null, number]>;
    const count = results[0]?.[1] ?? 0;
    if (count > config.NOTIFICATION_CONSUMER_CAP_PER_MIN) {
      incrementRateLimited();
      logger.warn(
        { tenantId, userId, count, code: 'NOTIFICATION_RATE_LIMITED' },
        'Notification delivery suppressed — per-user cap exceeded'
      );
      return true;
    }
    return false;
  } catch (error) {
    logger.warn(
      { code: 'NOTIF_CAP_REDIS_DOWN', err: String(error) },
      'Notification consumer cap fail-open'
    );
    return false;
  }
}
