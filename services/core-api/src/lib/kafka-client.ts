// lib/kafka-client.ts
// The single kafkajs client instance for the process.
//
// Extracted from kafka.ts so the producer lifecycle state machine
// (kafka-producer.ts) and the transport wrapper (kafka.ts) can both reach the
// client without a circular import. Importing this module has no network side
// effects — kafkajs only opens sockets on connect().

import { Kafka, logLevel } from 'kafkajs';

import { config } from './config.js';

export const kafkaClient = new Kafka({
  clientId: 'plexica-core',
  brokers: config.KAFKA_BROKERS.split(','),
  logLevel: logLevel.ERROR,
  retry: {
    initialRetryTime: 100,
    retries: 3,
  },
});

export type KafkaProducer = ReturnType<typeof kafkaClient.producer>;
export type KafkaConsumer = ReturnType<typeof kafkaClient.consumer>;
export type KafkaAdmin = ReturnType<typeof kafkaClient.admin>;
