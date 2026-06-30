// services/health-check.service.ts
// Periodic health checker with Redis-backed circuit breaker.
// States: closed (healthy) → open (degraded) → half-open → closed.
// State persisted in Redis to survive server restarts.

import { logger } from '../../../lib/logger.js';
import { redis } from '../../../lib/redis.js';

import type { ContainerManager, HealthStatus } from './container-manager.service.js';

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

// Health change listeners (in-process only — not persisted)
type HealthChangeHandler = (installId: string, oldStatus: HealthStatus, newStatus: HealthStatus) => void;
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

/**
 * Returns the current circuit state for a plugin installation.
 * safeParse() never throws (handles null and parse errors internally).
 */
export async function getCircuitState(installId: string): Promise<CircuitState> {
  const raw = await redis.get(cbKey(installId));
  if (!raw) return 'closed';
  const state = safeParse(raw, { state: 'closed', failureCount: 0, successCount: 0, lastFailureAt: null, lastTransitionAt: Date.now() });
  return state.state;
}

/**
 * Records a health check success and transitions state accordingly.
 */
function safeParse(raw: string | null, fallback: CircuitBreakerState): CircuitBreakerState {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

export async function recordSuccess(installId: string): Promise<CircuitState> {
  const raw = await redis.get(cbKey(installId));
  let state = safeParse(raw, { state: 'closed', failureCount: 0, successCount: 0, lastFailureAt: null, lastTransitionAt: Date.now() });

  state.successCount++;

  if (state.state === 'half-open' && state.successCount >= 3) {
    state.state = 'closed';
    state.failureCount = 0;
    state.lastTransitionAt = Date.now();
    logger.info({ installId }, 'Circuit breaker closed — plugin healthy');
    notify(installId, 'degraded', 'healthy');
  } else if (state.state === 'open') {
    // Do NOT transition directly from open to closed — shouldProbe() handles
    // the open → half-open → closed sequence via timeout. This prevents
    // flaky plugins from immediately resetting the breaker.
    // Simply persist the updated success count.
  }

  await redis.set(cbKey(installId), JSON.stringify(state), 'EX', CB_TTL_SECONDS);
  return state.state;
}

/**
 * Records a health check failure and transitions state accordingly.
 */
export async function recordFailure(installId: string): Promise<CircuitState> {
  const raw = await redis.get(cbKey(installId));
  let state = safeParse(raw, { state: 'closed', failureCount: 0, successCount: 0, lastFailureAt: null, lastTransitionAt: Date.now() });

  state.failureCount++;
  state.lastFailureAt = Date.now();
  state.successCount = 0;

  if (state.state === 'closed' && state.failureCount >= FAILURE_THRESHOLD) {
    state.state = 'open';
    state.lastTransitionAt = Date.now();
    logger.warn({ installId, failureCount: state.failureCount }, 'Circuit breaker opened — plugin degraded');
    notify(installId, 'healthy', 'degraded');
  } else if (state.state === 'half-open') {
    state.state = 'open';
    state.lastTransitionAt = Date.now();
    logger.warn({ installId }, 'Circuit breaker back to open — half-open probe failed');
    notify(installId, 'degraded', 'degraded');
  }

  await redis.set(cbKey(installId), JSON.stringify(state), 'EX', CB_TTL_SECONDS);
  return state.state;
}

/**
 * Checks whether a probe is allowed.
 */
export async function shouldProbe(installId: string): Promise<boolean> {
  const raw = await redis.get(cbKey(installId));
  if (!raw) return true;

  const state = safeParse(raw, { state: 'closed', failureCount: 0, successCount: 0, lastFailureAt: null, lastTransitionAt: Date.now() });
  if (state.state === 'closed') return true;
  if (state.state === 'half-open') return true;

  if (state.state === 'open') {
    const elapsed = Date.now() - state.lastTransitionAt;
    if (elapsed >= HALF_OPEN_TIMEOUT_MS) {
      state.state = 'half-open';
      state.successCount = 0;
      state.lastTransitionAt = Date.now();
      await redis.set(cbKey(installId), JSON.stringify(state), 'EX', CB_TTL_SECONDS);
      logger.info({ installId }, 'Circuit breaker half-open — allowing probe');
      return true;
    }
    return false;
  }

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

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function startPeriodicHealthPolling(
  containerManager: ContainerManager,
  getInstallIds: () => string[] | Promise<string[]>,
  intervalMs = 30_000
): void {
  if (pollingInterval !== null) return;

  pollingInterval = setInterval(async () => {
    try {
      const ids = await getInstallIds();
      await Promise.all(
        ids.map(async (installId) => {
          const canProbe = await shouldProbe(installId);
          if (!canProbe) return;
          try {
            const status = await containerManager.getContainerStatus(installId);
            if (status.state === 'running') {
              await recordSuccess(installId);
            } else {
              await recordFailure(installId);
            }
          } catch {
            await recordFailure(installId);
          }
        })
      );
    } catch (err) {
      logger.error({ err }, 'Health polling cycle failed');
    }
  }, intervalMs);

  logger.info({ intervalMs }, 'Periodic health polling started');
}

export function stopPeriodicHealthPolling(): void {
  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logger.info('Periodic health polling stopped');
  }
}
