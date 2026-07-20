// health-check-kafka.ts
// Kafka / Redpanda health probe — opens a transient admin client, connects,
// and lists topics to verify broker connectivity. The admin client is
// disconnected after the probe to avoid leaking connections.
// Implements: Spec 005, Feature 005-09 (S5-100)

import { getKafkaAdmin } from '../../../lib/kafka.js';

import { buildServiceResult, withProbeTimeout } from './health-checker.service.js';

import type { HealthServiceResult } from '../schemas/health-schemas.js';

export async function probeKafka(): Promise<HealthServiceResult> {
  const name = 'kafka';
  const start = performance.now();
  const admin = getKafkaAdmin();

  try {
    await withProbeTimeout((async () => {
      await admin.connect();
      try {
        await admin.listTopics();
      } finally {
        await admin.disconnect();
      }
    })());
    return buildServiceResult(name, Math.round(performance.now() - start), null);
  } catch (error) {
    // Best-effort cleanup — ignore secondary failures during disconnect.
    await admin.disconnect().catch(() => undefined);
    return buildServiceResult(name, Math.round(performance.now() - start), error);
  }
}
