import { randomUUID } from 'node:crypto';

import { Kafka } from 'kafkajs';

const [broker, scope] = process.argv.slice(2);
if (!broker || !scope) throw new Error('Usage: verify-kafka-roundtrip.mjs <host:port> <scope>');

const topic = `plexica.ci.${scope.replace(/[^a-z0-9-]/g, '-')}`;
const clientId = `plexica-ci-${scope}`;
const kafka = new Kafka({ clientId, brokers: [broker] });
const admin = kafka.admin();
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: `${clientId}-consumer` });
const payload = randomUUID();

await admin.connect();
const metadata = await admin.describeCluster();
if (!metadata.brokers.some(({ host, port }) => `${host}:${port}` === broker)) {
  throw new Error(`Kafka metadata does not advertise the manifest listener ${broker}`);
}
await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
await producer.connect();
await consumer.connect();
// KafkaJS requires subscribe() before run(): starting a consumer without a
// subscription rejects asynchronously and the timeout below would misreport
// the failure mode.
await consumer.subscribe({ topic, fromBeginning: false });
let timedOut = false;
let resolveReceived;
let rejectReceived;
const received = new Promise((resolve, reject) => {
  resolveReceived = resolve;
  rejectReceived = reject;
});
const timer = setTimeout(() => {
  timedOut = true;
  rejectReceived(new Error(`Kafka round trip timed out on ${topic}`));
}, 15_000);
timer.unref();
await consumer.run({
  eachMessage: async ({ message }) => {
    if (message.value?.toString() === payload) {
      globalThis.clearTimeout(timer);
      resolveReceived();
    }
  },
});
try {
  await producer.send({ topic, messages: [{ value: payload }] });
  await received;
} finally {
  // Graceful disconnect on every path so a failed verification never leaves
  // the process hanging on open sockets; the original error still propagates
  // and exits non-zero.
  await Promise.allSettled([consumer.disconnect(), producer.disconnect()]);
}
if (timedOut) process.exit(1);
await admin.deleteTopics({ topics: [topic] });
await admin.disconnect();
