// bootstrap.ts
// External-service lifecycle for core-api. index.ts owns HTTP wiring only;
// everything that opens a connection (Redis, Kafka, PostgreSQL) or starts a
// background worker is started and stopped here, in one documented order.
//
// Startup order (startBackgroundServices)          Teardown order (stopBackgroundServices)
//   1. Kafka producer warm-up                        1. metrics aggregator          (7)
//   2. event workers (outbox + DLQ consumer)         2. plugin health poller        (6)
//   3. tenant lifecycle worker                       3. plugin consumer groups      (5)
//   4. deletion saga startup sweep (fire & forget)   4. tenant lifecycle worker     (3)
//   5. plugin consumer groups (reconcile)            5. event workers               (2)
//   6. plugin health poller                          6. Kafka producer              (1)
//   7. metrics aggregator                            7. tenant DB client cache (ADR-027)
//                                                    8. PostgreSQL
//                                                    9. Redis
// Teardown is the exact reverse of startup: every Kafka producer/consumer is
// stopped before the connections and stores it depends on (Kafka, PostgreSQL,
// Redis) are closed. Nothing is started here without a matching stop.

import { startEventWorkers, stopEventWorkers } from './events/event-workers.js';
import { disconnectDatabase, prisma } from './lib/database.js';
import { disconnectKafka, initKafka } from './lib/kafka.js';
import { logger } from './lib/logger.js';
import { disconnectRedis, redis } from './lib/redis.js';
import { disconnectAllTenantDbClients } from './lib/tenant-database.js';
import { startupSweep } from './modules/admin/services/deletion-saga.service.js';
import {
  startMetricsAggregator,
  stopMetricsAggregator,
} from './modules/admin/services/metrics-aggregator.service.js';
import {
  startTenantLifecycleWorker,
  stopTenantLifecycleWorker,
} from './modules/admin/services/tenant-lifecycle-worker.js';
import { disconnectAllConsumerGroups } from './modules/plugin/events/consumer-manager.service.js';
import { startPluginHealthPolling, stopPluginHealthPolling } from './modules/plugin/index.js';
import { reconcilePluginRuntimes } from './modules/plugin/services/runtime-recovery.service.js';

/**
 * Connects Redis eagerly so the first request does not pay the TCP handshake.
 *
 * Must run before @fastify/rate-limit is registered with the same client.
 * `lazyConnect: true` in redis.ts makes connect() a no-op when already
 * connected. A failure is non-fatal: rate limiting degrades to in-memory and
 * fails open (ADR-012).
 */
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch {
    logger.warn(
      'Redis unavailable at startup — rate limiting degraded to in-memory (fail-open per ADR-012)'
    );
  }
}

/**
 * Starts every background service before the HTTP listener accepts traffic.
 *
 * Throwing here aborts startup (see the caller's try/catch), so anything that
 * must not block a boot with a degraded dependency is fire-and-forget with its
 * own error handling.
 */
export async function startBackgroundServices(): Promise<void> {
  // 1. Kafka producer warm-up. Non-blocking and never throws, so a broker that
  // is still booting cannot block startup; the connection is retried on the
  // first emit. Done first so the first outbox publish skips the handshake.
  initKafka();

  // 2-3. Publishers and workers that depend on the producer above.
  await startEventWorkers();
  startTenantLifecycleWorker();

  // 4. Discover every pending saga; CAS leases delay live work and recover crashed work.
  void startupSweep(prisma).catch(() => logger.error('Deletion saga startup sweep failed'));

  // 5. Restore Kafka subscriptions held only in memory before accepting new
  // workspace events. Individual broken installations do not block startup.
  await reconcilePluginRuntimes();

  // 6. Health poller for the installations restored above (Redis-backed
  // circuit breaker). Started here, not while registering plugin routes, so it
  // has a teardown counterpart that runs before disconnectRedis().
  startPluginHealthPolling();

  // 7. Scheduled job: aggregate user/workspace counts across tenant schemas
  // into Redis (5-minute interval). Dashboard reads the cached totals. Errors
  // within each tick are caught and logged inside the aggregator.
  startMetricsAggregator();
}

/**
 * Best-effort teardown step: a failure is logged and the shutdown continues,
 * so one broken dependency cannot strand the remaining connections.
 */
async function stopStep(name: string, stop: () => Promise<void>): Promise<void> {
  try {
    await stop();
  } catch (err) {
    logger.error({ err, step: name, code: 'SHUTDOWN_STEP_FAILED' }, 'Shutdown step failed');
  }
}

/**
 * Stops background services and closes external connections, in the exact
 * reverse of the startup order documented at the top of this file.
 *
 * Ordering rationale (changed from the previous workers → DB → Redis → Kafka):
 *   - timers first, and each stop awaits its in-flight cycle, so no tick is
 *     still querying Prisma or Redis when those close;
 *   - plugin consumer groups next: a live consumer keeps dispatching events and
 *     publishing to the DLQ, which would resurrect the producer after it was
 *     torn down and hit the database after it was closed;
 *   - the Kafka producer moved BEFORE PostgreSQL/Redis: it was last, so every
 *     publisher above it was still able to enqueue during shutdown.
 *
 * disconnectKafka() also tears down a warm-up connection that is still in
 * flight and marks the producer permanently closed, so a shutdown racing
 * startup leaves no dangling socket.
 *
 * Never throws: individual failures are logged per step.
 */
export async function stopBackgroundServices(): Promise<void> {
  await stopStep('metrics-aggregator', stopMetricsAggregator);
  await stopStep('plugin-health-polling', stopPluginHealthPolling);
  await stopStep('plugin-consumer-groups', disconnectAllConsumerGroups);
  await stopStep('tenant-lifecycle-worker', stopTenantLifecycleWorker);
  await stopStep('event-workers', stopEventWorkers);
  await stopStep('kafka-producer', disconnectKafka);
  // Tenant client pools (ADR-027) close BEFORE the core pool, so no cached
  // tenant connection can outlive the singleton it was derived from.
  await stopStep('tenant-db-clients', disconnectAllTenantDbClients);
  await stopStep('database', disconnectDatabase);
  await stopStep('redis', disconnectRedis);
}
