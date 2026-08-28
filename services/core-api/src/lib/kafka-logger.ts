// lib/kafka-logger.ts
// Sanitized Confluent logger bridge — never forwards raw client text/extra
// which may contain broker coordinates, payload/ciphertext, headers or keys.

import { KafkaJS } from '@confluentinc/kafka-javascript';

import { logger } from './logger.js';

type Component = 'kafka' | 'producer' | 'consumer' | 'admin' | 'unknown';

const KNOWN_COMPONENTS = new Set<string>([
  'kafka',
  'producer',
  'consumer',
  'admin',
  'client',
  'connection',
  'topic',
]);

function toComponent(namespace: string): Component {
  const normalized = namespace.toLowerCase();
  if (normalized.includes('producer')) return 'producer';
  if (normalized.includes('consumer')) return 'consumer';
  if (normalized.includes('admin')) return 'admin';
  if (KNOWN_COMPONENTS.has(normalized)) return 'kafka';
  return 'unknown';
}

// KafkaJS.logLevel severity is the enum value itself (NOTHING=0, ERROR=1,
// WARN=2, INFO=3, DEBUG=4): emit when severity <= configured level.
function shouldEmit(configured: KafkaJS.logLevel, severity: KafkaJS.logLevel): boolean {
  return severity <= configured;
}

function emit(level: string, component: Component, code: string): void {
  const payload = { code, component, level };
  if (level === 'error') logger.error(payload, 'Kafka client log');
  else if (level === 'warn') logger.warn(payload, 'Kafka client log');
  else if (level === 'debug') logger.debug(payload, 'Kafka client log');
  else logger.info(payload, 'Kafka client log');
}

class PinoKafkaLogger implements KafkaJS.Logger {
  constructor(
    private readonly component: Component,
    private logLevel: KafkaJS.logLevel = KafkaJS.logLevel.ERROR
  ) {}

  debug(_message: string, _extra?: object): void {
    if (!shouldEmit(this.logLevel, KafkaJS.logLevel.DEBUG)) return;
    emit('debug', this.component, 'KAFKA_CLIENT_DEBUG');
  }

  info(_message: string, _extra?: object): void {
    if (!shouldEmit(this.logLevel, KafkaJS.logLevel.INFO)) return;
    emit('info', this.component, 'KAFKA_CLIENT_INFO');
  }

  warn(_message: string, _extra?: object): void {
    if (!shouldEmit(this.logLevel, KafkaJS.logLevel.WARN)) return;
    emit('warn', this.component, 'KAFKA_CLIENT_WARN');
  }

  error(_message: string, _extra?: object): void {
    if (!shouldEmit(this.logLevel, KafkaJS.logLevel.ERROR)) return;
    emit('error', this.component, 'KAFKA_CLIENT_ERROR');
  }

  namespace(namespace: string, logLevel?: KafkaJS.logLevel): KafkaJS.Logger {
    return new PinoKafkaLogger(toComponent(namespace), logLevel ?? this.logLevel);
  }

  setLogLevel(level: KafkaJS.logLevel): void {
    this.logLevel = level;
  }
}

export function createKafkaLogger(): KafkaJS.Logger {
  return new PinoKafkaLogger('kafka', KafkaJS.logLevel.ERROR);
}
