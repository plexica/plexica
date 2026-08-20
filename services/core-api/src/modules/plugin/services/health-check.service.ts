// services/health-check.service.ts
// Redis-backed circuit breaker for plugin installations.
// States: closed (healthy) → open (degraded) → half-open → closed.
// State persisted in Redis to survive server restarts.
// The periodic poller that drives it lives in health-polling.service.ts.

import { logger } from '../../../lib/logger.js';
import { redis } from '../../../lib/redis.js';

import type { HealthStatus } from './container-manager.service.js';

const CB_PREFIX = 'plugin:cb:';
const FAILURE_THRESHOLD = 3;
const HALF_OPEN_TIMEOUT_MS = 30_000; // 30s before allowing probe
const CB_TTL_SECONDS = 86_400; // 24h TTL for circuit breaker state

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  lastTransitionAt: number;
}

// Health change listeners (in-process only — not persisted here).
// The registered consumer is health-observability.service.ts, which persists
// transitions to plugin_container_config.health_status and to the Redis
// health gauge. Registration happens in proxy.service.ts (module load).
export type HealthChangeHandler = (
  installId: string,
  oldStatus: HealthStatus,
  newStatus: HealthStatus
) => void;
const listeners: Set<HealthChangeHandler> = new Set();

export function onHealthChange(handler: HealthChangeHandler): void {
  listeners.add(handler);
}

export function removeHealthChangeHandler(handler: HealthChangeHandler): void {
  listeners.delete(handler);
}

function cbKey(installId: string): string {
  return `${CB_PREFIX}${installId}`;
}

function defaultState(): CircuitBreakerState {
  return {
    state: 'closed',
    failureCount: 0,
    successCount: 0,
    lastFailureAt: null,
    lastTransitionAt: Date.now(),
  };
}

function safeParse(raw: string | null, fallback: CircuitBreakerState): CircuitBreakerState {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as CircuitBreakerState;
  } catch {
    return fallback;
  }
}

/** Reads the persisted breaker state, falling back to a fresh closed circuit. */
async function readState(installId: string): Promise<CircuitBreakerState> {
  return safeParse(await redis.get(cbKey(installId)), defaultState());
}

async function writeState(installId: string, state: CircuitBreakerState): Promise<void> {
  await redis.set(cbKey(installId), JSON.stringify(state), 'EX', CB_TTL_SECONDS);
}

/**
 * Records a health check success and transitions state accordingly.
 */
export async function recordSuccess(installId: string): Promise<CircuitState> {
  const state = await readState(installId);

  state.successCount++;

  if (state.state === 'half-open' && state.successCount >= 3) {
    state.state = 'closed';
    state.failureCount = 0;
    state.lastTransitionAt = Date.now();
    logger.info({ installId }, 'Circuit breaker closed — plugin healthy');
    notify(installId, 'degraded', 'healthy');
  }
  // Do NOT transition directly from open to closed — shouldProbe() handles
  // the open → half-open → closed sequence via timeout. This prevents flaky
  // plugins from immediately resetting the breaker; only the count persists.

  await writeState(installId, state);
  return state.state;
}

/**
 * Records a health check failure and transitions state accordingly.
 */
export async function recordFailure(installId: string): Promise<CircuitState> {
  const state = await readState(installId);

  state.failureCount++;
  state.lastFailureAt = Date.now();
  state.successCount = 0;

  if (state.state === 'closed' && state.failureCount >= FAILURE_THRESHOLD) {
    state.state = 'open';
    state.lastTransitionAt = Date.now();
    logger.warn(
      { installId, failureCount: state.failureCount },
      'Circuit breaker opened — plugin degraded'
    );
    notify(installId, 'healthy', 'degraded');
  } else if (state.state === 'half-open') {
    state.state = 'open';
    state.lastTransitionAt = Date.now();
    logger.warn({ installId }, 'Circuit breaker back to open — half-open probe failed');
    notify(installId, 'degraded', 'degraded');
  }

  await writeState(installId, state);
  return state.state;
}

/**
 * Checks whether a probe is allowed.
 */
export async function shouldProbe(installId: string): Promise<boolean> {
  const raw = await redis.get(cbKey(installId));
  if (!raw) return true;

  const state = safeParse(raw, defaultState());
  if (state.state !== 'open') return true;

  const elapsed = Date.now() - state.lastTransitionAt;
  if (elapsed < HALF_OPEN_TIMEOUT_MS) return false;

  state.state = 'half-open';
  state.successCount = 0;
  state.lastTransitionAt = Date.now();
  await writeState(installId, state);
  logger.info({ installId }, 'Circuit breaker half-open — allowing probe');
  return true;
}

/**
 * Resets circuit breaker state (used on uninstall).
 */
export async function resetBreaker(installId: string): Promise<void> {
  await redis.del(cbKey(installId));
}

function notify(installId: string, oldStatus: HealthStatus, newStatus: HealthStatus): void {
  for (const handler of listeners) {
    try {
      handler(installId, oldStatus, newStatus);
    } catch (err) {
      logger.error({ err, installId }, 'Health change handler failed');
    }
  }
}
