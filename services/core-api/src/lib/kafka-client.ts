// lib/kafka-client.ts
// The single Kafka client instance for the process.

import { KafkaJS } from '@confluentinc/kafka-javascript';

import { config } from './config.js';
import { createKafkaLogger } from './kafka-logger.js';

export function parseKafkaBrokers(value: string): string[] {
  const raw = value.split(',');
  const brokers: string[] = [];
  for (const segment of raw) {
    const broker = segment.trim();
    if (!broker) throw new Error('KAFKA_BROKERS_INVALID');
    if (broker.includes('://')) throw new Error('KAFKA_BROKERS_INVALID');
    const colon = broker.lastIndexOf(':');
    if (colon === -1) throw new Error('KAFKA_BROKERS_INVALID');
    const host = broker.slice(0, colon).trim();
    const portRaw = broker.slice(colon + 1).trim();
    if (!host || !portRaw) throw new Error('KAFKA_BROKERS_INVALID');
    const port = Number(portRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('KAFKA_BROKERS_INVALID');
    brokers.push(`${host}:${port}`);
  }
  if (brokers.length === 0) throw new Error('KAFKA_BROKERS_INVALID');
  return brokers;
}

const brokers = parseKafkaBrokers(config.KAFKA_BROKERS);

export const kafkaClient = new KafkaJS.Kafka({
  kafkaJS: {
    brokers,
    clientId: 'plexica-core',
    logLevel: KafkaJS.logLevel.ERROR,
    logger: createKafkaLogger(),
    retry: { retries: 3, initialRetryTime: 100 },
  },
});

export type KafkaProducer = ReturnType<typeof kafkaClient.producer>;
export type KafkaConsumer = ReturnType<typeof kafkaClient.consumer>;
export type KafkaAdmin = ReturnType<typeof kafkaClient.admin>;
