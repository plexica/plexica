import { randomUUID } from 'node:crypto';
import { clearTimeout } from 'node:timers';

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
await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
await producer.connect();
await consumer.connect();
const received = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Kafka round trip timed out')), 15_000);
  void consumer.run({ eachMessage: async ({ message }) => {
    if (message.value?.toString() === payload) { clearTimeout(timer); resolve(); }
  } });
});
await consumer.subscribe({ topic, fromBeginning: false });
await producer.send({ topic, messages: [{ value: payload }] });
await received;
await consumer.disconnect();
await producer.disconnect();
await admin.deleteTopics({ topics: [topic] });
await admin.disconnect();
