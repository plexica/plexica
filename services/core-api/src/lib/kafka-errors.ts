// lib/kafka-errors.ts
// Error classification by numeric codes and structured error classes — never by
// message/name. Prisma errors are classified ONLY by the retriable allowlist;
// the message-regex fallback applies exclusively to non-Prisma errors.

import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Prisma } from '@prisma/client';

export class KafkaSendError extends Error {
  readonly code = 'KAFKA_SEND_FAILED';
  constructor(cause?: unknown) {
    super('Kafka send failed');
    this.name = 'KafkaSendError';
    if (cause instanceof Error && cause.stack) this.stack = cause.stack;
  }
}

export function isKafkaJSError(error: unknown): boolean {
  return KafkaJS.isKafkaJSError(error as Error);
}

export type ErrorCategory =
  'timeout' | 'transport' | 'authentication' | 'authorization' | 'rebalance' | 'state' | 'unknown';

export function classifyKafkaError(error: unknown): {
  code: number | null;
  category: ErrorCategory;
  fatal: boolean;
} {
  if (!isKafkaJSError(error)) return { code: null, category: 'unknown', fatal: false };
  const kafkaError = error as InstanceType<typeof KafkaJS.KafkaJSError>;
  const code: number = (kafkaError as unknown as { code: number }).code ?? -1;
  const fatal: boolean = Boolean((kafkaError as unknown as { fatal: boolean }).fatal);
  const { ErrorCodes } = KafkaJS;

  if (code === ErrorCodes.ERR__TIMED_OUT || code === ErrorCodes.ERR_REQUEST_TIMED_OUT) {
    return { code, category: 'timeout', fatal };
  }
  if (
    code === ErrorCodes.ERR__TRANSPORT ||
    code === ErrorCodes.ERR__ALL_BROKERS_DOWN ||
    code === ErrorCodes.ERR_BROKER_NOT_AVAILABLE ||
    code === ErrorCodes.ERR_NETWORK_EXCEPTION
  ) {
    return { code, category: 'transport', fatal };
  }
  if (
    code === ErrorCodes.ERR__AUTHENTICATION ||
    code === ErrorCodes.ERR_SASL_AUTHENTICATION_FAILED
  ) {
    return { code, category: 'authentication', fatal };
  }
  if (
    code === ErrorCodes.ERR_TOPIC_AUTHORIZATION_FAILED ||
    code === ErrorCodes.ERR_GROUP_AUTHORIZATION_FAILED ||
    code === ErrorCodes.ERR_CLUSTER_AUTHORIZATION_FAILED
  ) {
    return { code, category: 'authorization', fatal };
  }
  if (
    code === ErrorCodes.ERR__ASSIGN_PARTITIONS ||
    code === ErrorCodes.ERR__REVOKE_PARTITIONS ||
    code === ErrorCodes.ERR_REBALANCE_IN_PROGRESS ||
    code === ErrorCodes.ERR_ILLEGAL_GENERATION ||
    code === ErrorCodes.ERR_UNKNOWN_MEMBER_ID
  ) {
    return { code, category: 'rebalance', fatal };
  }
  if (code === ErrorCodes.ERR__STATE || code === ErrorCodes.ERR__CONFLICT) {
    return { code, category: 'state', fatal };
  }
  return { code, category: 'unknown', fatal };
}

export function isTimeoutError(error: unknown): boolean {
  return classifyKafkaError(error).category === 'timeout';
}

export function isRetriableConsumerError(error: unknown): boolean {
  const { category, fatal } = classifyKafkaError(error);
  if (fatal) return false;
  return category === 'timeout' || category === 'transport' || category === 'rebalance';
}

// Transient Prisma codes — connection establishment (P1001/P1011), connection
// and operation timeouts (P1002/P1008), server closure (P1017), pool
// exhaustion (P2024), and transaction API errors (P2028). All are documented
// transient codes.
const RETRIABLE_PRISMA_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1011',
  'P1017',
  'P2024',
  'P2028',
  'P2034',
]);

export function isRetriablePrismaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRIABLE_PRISMA_CODES.has(error.code);
  }
  // These classes are never transient by construction; a matching message
  // must not classify them as retriable.
  if (
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientValidationError
  ) {
    return false;
  }
  // Non-Prisma errors only — every known Prisma class is short-circuited
  // above, so this regex never classifies Prisma by message text.
  const msg = error instanceof Error ? error.message : String(error);
  return /Timed out|connection|ECONNREFUSED|ETIMEDOUT|P1001|P1002/i.test(msg);
}
