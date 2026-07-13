// health-checker.service.ts
// Orchestrates infrastructure health probes in parallel and aggregates
// the results into a single health response.
// Implements: Spec 005, Feature 005-09 (S5-100)
//
// Each probe runs with a 200ms timeout. Probes run concurrently via
// Promise.all so the overall response time stays well under 500ms (NFR).
//
// Status semantics (spec §7 edge case):
//   healthy  — responsive and fast (latency < 1s)
//   degraded — responsive but slow (latency 1-5s, or probe timed out)
//   down     — unreachable / hard error (connection refused, DNS, auth)
//
// No connection strings, credentials, or version numbers are exposed.

import { probeKafka } from './health-check-kafka.js';
import { probeKeycloak } from './health-check-keycloak.js';
import { probeMinio } from './health-check-minio.js';
import { probePostgres } from './health-check-postgres.js';
import { probeRedis } from './health-check-redis.js';

import type { FastifyBaseLogger } from 'fastify';
import type { HealthResponse, HealthServiceResult, HealthStatus } from '../schemas/health-schemas.js';

/** Per-probe timeout in milliseconds. */
export const PROBE_TIMEOUT_MS = 200;

/**
 * Wraps a probe promise with a hard timeout. On timeout the promise rejects
 * with the AbortSignal's reason (a DOMException named 'TimeoutError'), which
 * classifyProbeResult maps to 'degraded'.
 */
export function withProbeTimeout<T>(probe: Promise<T>, logger?: FastifyBaseLogger): Promise<T> {
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    probe.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
    if (logger) {
      probe.catch((err) => {
        logger.debug({ err }, 'health probe failed');
      });
    }
  });
}

/**
 * Maps a probe outcome (latency + optional error) to a coarse status enum.
 * A timeout (DOMException 'TimeoutError') is treated as 'degraded' — the
 * service may be alive but too slow to be considered healthy. Any other
 * error is 'down' (unreachable, auth failure, etc.).
 */
export function classifyProbeResult(latencyMs: number, error: unknown): HealthStatus {
  if (error !== undefined && error !== null) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return 'degraded';
    }
    return 'down';
  }
  if (latencyMs < 1000) return 'healthy';
  if (latencyMs < 5000) return 'degraded';
  return 'down';
}

/** Builds a HealthServiceResult, never throws — all failures become 'down'/'degraded'. */
export function buildServiceResult(
  name: string,
  latencyMs: number,
  error: unknown
): HealthServiceResult {
  return { name, status: classifyProbeResult(latencyMs, error), latencyMs };
}

type ProbeEntry = { name: string; run: () => Promise<HealthServiceResult> };

/**
 * Runs all infrastructure probes in parallel and returns the aggregated
 * health response. Each probe is individually responsible for its own
 * 200ms timeout handling (via withProbeTimeout or AbortSignal.timeout).
 */
export async function checkHealth(): Promise<HealthResponse> {
  const probes: ProbeEntry[] = [
    { name: 'postgres', run: probePostgres },
    { name: 'redis', run: probeRedis },
    { name: 'keycloak', run: probeKeycloak },
    { name: 'kafka', run: probeKafka },
    { name: 'minio', run: probeMinio },
  ];

  const settled = await Promise.allSettled(probes.map((entry) => entry.run()));
  const services: HealthServiceResult[] = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    // A probe throwing outside its internal try/catch is a programmer error;
    // surface it as 'down' rather than letting the endpoint crash.
    const name = probes.at(index)?.name ?? 'unknown';
    return buildServiceResult(name, PROBE_TIMEOUT_MS, result.reason);
  });

  return { services };
}
