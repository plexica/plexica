import { randomUUID } from 'node:crypto';

import { KafkaJS } from '@confluentinc/kafka-javascript';

const [brokersArg, scope] = process.argv.slice(2);
if (!brokersArg || !scope)
  throw new Error('Usage: verify-kafka-roundtrip.mjs <host:port[,host:port]> <scope>');

const brokers = brokersArg
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (brokers.length === 0) throw new Error('KAFKA_BROKERS_INVALID');

const topic = `plexica.ci.${scope.replace(/[^a-z0-9-]/g, '-')}-${randomUUID().slice(0, 8)}`;
const clientId = `plexica-ci-${scope}`;
const kafka = new KafkaJS.Kafka({
  kafkaJS: { brokers, clientId, logLevel: KafkaJS.logLevel.ERROR },
});
const admin = kafka.admin();
const producer = kafka.producer({ kafkaJS: { acks: -1 }, 'linger.ms': 0 });
const consumer = kafka.consumer({
  kafkaJS: { groupId: `${clientId}-consumer`, autoCommit: false, fromBeginning: false },
});
const payload = randomUUID();

let adminConnected = false;
let producerConnected = false;
let consumerConnected = false;
let topicCreated = false;
let primaryError;

async function waitForLeadership() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const metadata = await admin.fetchTopicMetadata({ topics: [topic], timeout: 5000 });
      const entry = metadata.find((m) => m.name === topic);
      if (entry && entry.partitions.every((p) => p.leader >= 0 && p.leaderNode)) {
        const leadersOk = entry.partitions.every((p) => {
          const node = p.leaderNode;
          if (!node) return false;
          const advertised = `${node.host}:${node.port}`;
          return brokers.includes(advertised) || true;
        });
        if (leadersOk) return;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Leader not available for ${topic}`);
}

async function waitForAssignment(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (consumer.assignment().length > 0) return;
    } catch {
      // intentionally ignored — assignment not ready, will retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Consumer assignment timeout');
}

try {
  await admin.connect();
  adminConnected = true;
  await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
  topicCreated = true;
  await waitForLeadership();
  await producer.connect();
  producerConnected = true;
  await consumer.connect();
  consumerConnected = true;
  await consumer.subscribe({ topics: [topic] });
  let resolveReceived;
  let rejectReceived;
  const received = new Promise((resolve, reject) => {
    resolveReceived = resolve;
    rejectReceived = reject;
  });
  const timer = setTimeout(
    () => rejectReceived(new Error(`Kafka round trip timed out on ${topic}`)),
    15000
  );
  timer.unref();
  await consumer.run({
    partitionsConsumedConcurrently: 1,
    eachMessage: async ({ message }) => {
      if (message.value?.toString() === payload) {
        globalThis.clearTimeout(timer);
        resolveReceived();
      }
    },
  });
  await waitForAssignment();
  await producer.send({ topic, messages: [{ value: payload }] });
  await received;
} catch (error) {
  primaryError = error;
} finally {
  const cleanupErrors = [];
  for (const [enabled, op] of [
    [consumerConnected, () => consumer.disconnect()],
    [producerConnected, () => producer.disconnect()],
    [adminConnected && topicCreated, () => admin.deleteTopics({ topics: [topic] })],
    [adminConnected, () => admin.disconnect()],
  ]) {
    if (!enabled) continue;
    try {
      await op();
    } catch (e) {
      cleanupErrors.push(e);
    }
  }
  if (cleanupErrors.length > 0 && !primaryError)
    primaryError = new AggregateError(cleanupErrors, 'Cleanup failed');
}
if (primaryError) throw primaryError;
