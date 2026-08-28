// unit/kafka-logger.test.ts
// Level gating and namespace override for the sanitized Kafka logger bridge.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KafkaJS } from '@confluentinc/kafka-javascript';

vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createKafkaLogger } from '../../lib/kafka-logger.js';
import { logger } from '../../lib/logger.js';

describe('PinoKafkaLogger level gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('with ERROR configured only error emits (info/warn/debug do not)', () => {
    const kafkaLogger = createKafkaLogger();
    kafkaLogger.error('x');
    kafkaLogger.warn('x');
    kafkaLogger.info('x');
    kafkaLogger.debug('x');
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('with DEBUG configured all levels emit', () => {
    const kafkaLogger = createKafkaLogger();
    kafkaLogger.setLogLevel(KafkaJS.logLevel.DEBUG);
    kafkaLogger.error('x');
    kafkaLogger.warn('x');
    kafkaLogger.info('x');
    kafkaLogger.debug('x');
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.debug).toHaveBeenCalledOnce();
  });

  it('namespace("producer", WARN) child emits warn but not info', () => {
    const kafkaLogger = createKafkaLogger();
    const child = kafkaLogger.namespace('producer', KafkaJS.logLevel.WARN);
    child.warn('x');
    child.info('x');
    child.debug('x');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'KAFKA_CLIENT_WARN', component: 'producer' }),
      expect.any(String)
    );
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('namespace("consumer") inherits the parent level', () => {
    const kafkaLogger = createKafkaLogger();
    const child = kafkaLogger.namespace('consumer');
    child.error('x');
    child.info('x');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'KAFKA_CLIENT_ERROR', component: 'consumer' }),
      expect.any(String)
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('setLogLevel takes effect on the same logger instance', () => {
    const kafkaLogger = createKafkaLogger();
    kafkaLogger.info('x');
    expect(logger.info).not.toHaveBeenCalled();
    kafkaLogger.setLogLevel(KafkaJS.logLevel.INFO);
    kafkaLogger.info('x');
    expect(logger.info).toHaveBeenCalledOnce();
  });
});
