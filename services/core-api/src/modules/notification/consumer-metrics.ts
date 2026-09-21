// consumer-metrics.ts
// Lightweight in-memory counters for notification delivery outcomes (features
// 006-01/006-17). Phase 6 (observability) wires these into Prometheus counters
// via prom-client; this module stays dependency-free so the consumer has no
// metrics-coupling or registry-availability requirements.

export interface NotificationMetricsSnapshot {
  emittedTotal: number;
  rateLimitedTotal: number;
}

const counters: NotificationMetricsSnapshot = {
  emittedTotal: 0,
  rateLimitedTotal: 0,
};

export function incrementEmitted(): void {
  counters.emittedTotal += 1;
}

export function incrementRateLimited(): void {
  counters.rateLimitedTotal += 1;
}

export function getNotificationMetrics(): NotificationMetricsSnapshot {
  return { ...counters };
}
