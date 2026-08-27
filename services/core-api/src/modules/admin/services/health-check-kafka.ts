// health-check-kafka.ts
// Kafka / Redpanda health probe — bounded listTopics with owned cleanup.

import { withKafkaAdmin } from '../../../lib/kafka-admin.js';

import { makeProbe, withProbeTimeout } from './health-checker.service.js';

const pendingCleanups = new Set<Promise<void>>();

export async function awaitKafkaHealthCleanup(): Promise<void> {
  await Promise.allSettled([...pendingCleanups]);
}

export const probeKafka = makeProbe('kafka', async () => {
  const operation = withKafkaAdmin(async (admin) => {
    await admin.listTopics({ timeout: 200 });
  });
  let observed: Promise<void>;
  observed = operation
    .catch(() => undefined)
    .finally(() => {
      pendingCleanups.delete(observed);
    });
  pendingCleanups.add(observed);
  await withProbeTimeout(operation);
});
