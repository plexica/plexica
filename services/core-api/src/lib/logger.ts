// logger.ts
// Structured Pino logger. No console.log allowed in production code.
// When LOKI_URL is set, logs are also shipped to Loki via pino-loki
// (config-driven, no dev/prod code path differences). If Loki is unreachable,
// pino-loki buffers/drops logs — logging never blocks the main thread.

import pino, { type TransportTargetOptions } from 'pino';

import { config } from './config.js';
import { LOGGER_REDACT_PATHS, LOKI_APP_LABEL } from './logging-contract.js';

const LOG_LEVEL = config.NODE_ENV === 'production' ? 'info' : 'debug';

// Never log PII (Constitution security rule)
const redactConfig = {
  paths: [...LOGGER_REDACT_PATHS],
  censor: '[REDACTED]',
};

function buildStdoutTarget(): TransportTargetOptions {
  // Pretty-printed stdout in development; raw JSON lines in production.
  if (config.NODE_ENV !== 'production') {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
      level: LOG_LEVEL,
    };
  }
  return {
    target: 'pino/file',
    options: {},
    level: LOG_LEVEL,
  };
}

function buildLokiTarget(): TransportTargetOptions | null {
  // Loki transport is purely config-driven — no dev/prod branching.
  // Empty LOKI_URL = feature disabled (stdout-only), keeps CI green.
  if (!config.LOKI_URL) return null;
  return {
    target: 'pino-loki',
    options: {
      host: config.LOKI_URL,
      // Buffer logs and send in batches; if Loki is down, oldest logs are
      // dropped (FIFO) once maxBufferSize is reached — never blocks.
      batching: { interval: 5, maxBufferSize: 10000 },
      // Silence transport errors so Loki outages don't spam stdout.
      silenceErrors: true,
      // Contract: app/env and pino-loki's bounded level are the only labels.
      // Tenant remains in the JSON line and is parsed exactly at query time.
      labels: { app: LOKI_APP_LABEL, env: config.NODE_ENV },
    },
    level: LOG_LEVEL,
  };
}

function buildTransport(): pino.TransportMultiOptions {
  const targets: TransportTargetOptions[] = [buildStdoutTarget()];
  const loki = buildLokiTarget();
  if (loki) targets.push(loki);
  return { targets };
}

export const logger = pino({
  level: LOG_LEVEL,
  transport: buildTransport(),
  redact: redactConfig,
});
