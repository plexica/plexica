import { randomUUID } from 'node:crypto';

import { KafkaJS } from '@confluentinc/kafka-javascript';

import { assert, quietLogger, record, waitFor, withTimeout } from './smoke-support.mjs';

const [brokerInput, scope = 'local', mode = 'success'] = process.argv.slice(2);
if (!brokerInput) throw new Error('Usage: redpanda-smoke.mjs <brokers> [scope] [success|failure]');

const brokers = brokerInput
  .split(',')
  .map((broker) => broker.trim())
  .filter(Boolean);
const suffix = randomUUID();
const topic = `plexica.kjm.spike-${suffix}`;
const groupId = `plexica-kjm-spike-${suffix}`;
const injectedError = new Error('KJM_INJECTED_FAILURE');
const standardHandles = new Set([process.stdin, process.stdout, process.stderr]);
const baselineHandles = new Set(process._getActiveHandles());
const timeline = [];
let adminConnected = false;
let producerConnected = false;
let consumerConnected = false;
let topicCreated = false;
let primaryError;

async function shutdownStep(name, operation) {
  const startedAt = Date.now();
  await operation();
  timeline.push({ name, durationMs: Date.now() - startedAt });
  record('shutdown', { name, status: 'complete' });
}

const kafka = new KafkaJS.Kafka({
  kafkaJS: { brokers, clientId: `plexica-kjm-${scope}`, logger: quietLogger },
});
const admin = kafka.admin();
const producer = kafka.producer({ kafkaJS: { acks: -1 }, 'linger.ms': 0 });
const consumer = kafka.consumer({
  kafkaJS: { groupId, autoCommit: false, fromBeginning: true },
});
let resolveReceived;
let rejectReceived;
const received = new Promise((resolve, reject) => {
  resolveReceived = resolve;
  rejectReceived = reject;
});

try {
  await admin.connect();
  adminConnected = true;
  await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
  topicCreated = true;
  const metadata = await waitFor(async () => {
    try {
      const topics = await admin.fetchTopicMetadata({ topics: [topic], timeout: 5_000 });
      const partition = topics[0]?.partitions[0];
      return partition?.leaderNode
        ? { partition: partition.partitionId, leader: partition.leader }
        : null;
    } catch {
      return null;
    }
  }, 'topic leader');
  record('admin-topic-ready', metadata);

  await producer.connect();
  producerConnected = true;
  await consumer.connect();
  consumerConnected = true;
  await consumer.subscribe({ topics: [topic] });
  await consumer.run({
    partitionsConsumedConcurrently: 1,
    eachMessage: async ({ topic: consumedTopic, partition, message }) => {
      try {
        if (consumedTopic !== topic || message.key?.toString() !== scope) return;
        const nextOffset = (BigInt(message.offset) + 1n).toString();
        record('consumer-received', { partition, sourceOffset: message.offset });
        await consumer.commitOffsets([{ topic, partition, offset: nextOffset }]);
        resolveReceived({ partition, sourceOffset: message.offset, committedOffset: nextOffset });
      } catch (error) {
        rejectReceived(error);
        throw error;
      }
    },
  });
  const assignment = await waitFor(() => {
    const current = consumer.assignment();
    return current.length > 0 ? current : null;
  }, 'consumer assignment');
  record('consumer-assigned', { partitions: assignment.length });

  if (mode === 'failure') {
    resolveReceived(null);
    throw injectedError;
  }
  const delivery = await producer.send({
    topic,
    messages: [{ key: scope, value: randomUUID() }],
  });
  assert(delivery.length === 1, 'KJM-G07: expected one delivery report');
  assert(
    delivery.every(({ errorCode }) => errorCode === 0),
    'KJM-G07: producer acknowledgement failed'
  );
  record('producer-acknowledged', { reports: delivery.length });

  const consumed = await withTimeout(received, 'consumed record', 15_000);
  const committed = await waitFor(async () => {
    const offsets = await admin.fetchOffsets({ groupId, topics: [topic], timeout: 5_000 });
    const offset = offsets[0]?.partitions.find(
      ({ partition }) => partition === consumed.partition
    )?.offset;
    return offset === consumed.committedOffset ? offset : null;
  }, 'manual committed offset');
  assert(BigInt(committed) === BigInt(consumed.sourceOffset) + 1n, 'KJM-G07: offset + 1 mismatch');
  record('offset-verified', { sourceOffset: consumed.sourceOffset, committedOffset: committed });
} catch (error) {
  primaryError = error;
} finally {
  const cleanupErrors = [];
  for (const [name, enabled, operation] of [
    ['consumer', consumerConnected, () => consumer.disconnect()],
    ['producer', producerConnected, () => producer.disconnect()],
    ['consumer-group', adminConnected && consumerConnected, () => admin.deleteGroups([groupId])],
    ['topic', adminConnected && topicCreated, () => admin.deleteTopics({ topics: [topic] })],
    ['admin', adminConnected, () => admin.disconnect()],
  ]) {
    if (!enabled) continue;
    try {
      await shutdownStep(name, operation);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length > 0)
    primaryError = new AggregateError(cleanupErrors, 'Smoke cleanup failed');
}

await waitFor(
  () => {
    const leaked = process
      ._getActiveHandles()
      .filter((handle) => !baselineHandles.has(handle) && !standardHandles.has(handle));
    return leaked.length === 0 ? true : null;
  },
  'Kafka handle release',
  5_000
);
record('handles-verified', { leaked: 0, shutdownOrder: timeline.map(({ name }) => name) });

if (mode === 'failure') {
  assert(primaryError === injectedError, 'KJM-G08: injected failure was not preserved');
  record('injected-failure-cleanup-verified');
} else if (primaryError) {
  throw primaryError;
} else {
  record('smoke-complete', { redpandaImage: process.env.KJM_REDPANDA_IMAGE ?? 'not-recorded' });
}
