// health-check-kafka.ts
// Kafka / Redpanda health probe — opens a transient admin client, connects,
// and lists topics to verify broker connectivity. The admin client is
// disconnected after the probe to avoid leaking connections.
// Implements: Spec 005, Feature 005-09 (S5-100)

import { getKafkaAdmin } from '../../../lib/kafka.js';

import { makeProbe, withProbeTimeout } from './health-checker.service.js';

export const probeKafka = makeProbe('kafka', async () => {
  const admin = getKafkaAdmin();
  try {
    await withProbeTimeout(
      (async () => {
        await admin.connect();
        try {
          await admin.listTopics();
        } finally {
          await admin.disconnect();
        }
      })()
    );
  } catch (error) {
    // Best-effort cleanup — ignore secondary failures during disconnect.
    await admin.disconnect().catch(() => undefined);
    throw error;
  }
});
