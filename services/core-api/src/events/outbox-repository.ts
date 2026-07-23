import { Prisma } from '@prisma/client';

import { domainEventEnvelopeSchema } from './event-envelope.js';

import type { DomainEventEnvelope } from './event-envelope.js';

export interface SqlExecutor {
  $executeRaw(query: Prisma.Sql): Promise<number>;
}

export interface SqlClient extends SqlExecutor {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

export interface ClaimedOutboxEvent extends DomainEventEnvelope {
  topic: string;
  attempts: number;
  leaseToken: string;
}

interface OutboxRow {
  eventId: string;
  tenantId: string;
  topic: string;
  eventType: string;
  schemaVersion: number;
  payload: unknown;
  producerKind: 'core' | 'plugin';
  producerId: string;
  correlationId: string;
  causationId: string | null;
  occurredAt: Date;
  attempts: number;
  leaseToken: string;
}

export async function enqueueEvent(
  client: SqlClient,
  topic: string,
  input: DomainEventEnvelope
): Promise<string> {
  const event = domainEventEnvelopeSchema.parse(input);
  if (topic.length > 128 || !/^[a-z][a-z0-9.-]+$/.test(topic)) {
    throw new Error('Invalid event topic');
  }
  const tenant = await client.$queryRaw<Array<{ status: string }>>(Prisma.sql`
    SELECT status::text AS status FROM core.tenants
    WHERE id = ${event.tenantId}::uuid FOR UPDATE
  `);
  if (tenant[0]?.status !== 'active') throw new Error('TENANT_NOT_ACTIVE');
  await client.$executeRaw(Prisma.sql`
    INSERT INTO core.event_outbox (
      event_id, tenant_id, topic, event_type, schema_version, payload,
      producer_kind, producer_id, correlation_id, causation_id, occurred_at
    ) VALUES (
      ${event.eventId}::uuid, ${event.tenantId}::uuid, ${topic}, ${event.type},
      ${event.schemaVersion}, ${JSON.stringify(event.payload)}::jsonb,
      ${event.producer.kind}, ${event.producer.id}, ${event.correlationId}::uuid,
      ${event.causationId}::uuid, ${event.occurredAt}::timestamptz
    )
  `);
  return event.eventId;
}

export async function claimOutboxEvents(
  client: SqlClient,
  limit = 50,
  leaseMs = 30_000
): Promise<ClaimedOutboxEvent[]> {
  const leaseToken = crypto.randomUUID();
  const rows = await client.$queryRaw<OutboxRow[]>(Prisma.sql`
    UPDATE core.event_outbox AS outbox
    SET lease_token = ${leaseToken}::uuid,
        lease_expires_at = now() + (${leaseMs} * interval '1 millisecond')
    FROM (
      SELECT candidate.event_id
      FROM core.event_outbox AS candidate
      JOIN core.tenants AS tenant ON tenant.id = candidate.tenant_id
      WHERE candidate.available_at <= now()
        AND (candidate.lease_expires_at IS NULL OR candidate.lease_expires_at <= now())
        AND tenant.status = 'active'
      ORDER BY candidate.available_at, candidate.created_at
      FOR UPDATE OF candidate SKIP LOCKED
      LIMIT ${limit}
    ) AS claimed
    WHERE outbox.event_id = claimed.event_id
    RETURNING outbox.event_id AS "eventId", outbox.tenant_id AS "tenantId",
      outbox.topic, outbox.event_type AS "eventType",
      outbox.schema_version AS "schemaVersion", outbox.payload,
      outbox.producer_kind AS "producerKind", outbox.producer_id AS "producerId",
      outbox.correlation_id AS "correlationId", outbox.causation_id AS "causationId",
      outbox.occurred_at AS "occurredAt", outbox.attempts,
      outbox.lease_token AS "leaseToken"
  `);
  return rows.map((row) => ({
    ...domainEventEnvelopeSchema.parse({
      eventId: row.eventId,
      tenantId: row.tenantId,
      type: row.eventType,
      schemaVersion: row.schemaVersion,
      payload: row.payload,
      producer: { kind: row.producerKind, id: row.producerId },
      correlationId: row.correlationId,
      causationId: row.causationId,
      occurredAt: row.occurredAt.toISOString(),
    }),
    topic: row.topic,
    attempts: row.attempts,
    leaseToken: row.leaseToken,
  }));
}

export async function acknowledgeOutboxEvent(
  client: SqlExecutor,
  eventId: string,
  leaseToken: string
): Promise<boolean> {
  const count = await client.$executeRaw(Prisma.sql`
    DELETE FROM core.event_outbox
    WHERE event_id = ${eventId}::uuid AND lease_token = ${leaseToken}::uuid
  `);
  return count === 1;
}

export async function releaseOutboxEvent(
  client: SqlExecutor,
  event: Pick<ClaimedOutboxEvent, 'eventId' | 'leaseToken' | 'attempts'>,
  errorCode: string
): Promise<boolean> {
  const delaySeconds = Math.min(300, 2 ** Math.min(event.attempts, 8));
  const count = await client.$executeRaw(Prisma.sql`
    UPDATE core.event_outbox
    SET attempts = attempts + 1,
        available_at = now() + (${delaySeconds} * interval '1 second'),
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error_code = ${errorCode.slice(0, 64)}
    WHERE event_id = ${event.eventId}::uuid
      AND lease_token = ${event.leaseToken}::uuid
  `);
  return count === 1;
}

export async function getOutboxMetrics(client: SqlClient): Promise<{
  pending: number;
  oldestAgeSeconds: number;
  maxAttempts: number;
}> {
  const [row] = await client.$queryRaw<Array<{
    pending: number;
    oldestAgeSeconds: number;
    maxAttempts: number;
  }>>(Prisma.sql`
    SELECT count(*)::integer AS "pending",
      coalesce(extract(epoch FROM now() - min(created_at)), 0)::float8 AS "oldestAgeSeconds",
      coalesce(max(attempts), 0)::integer AS "maxAttempts"
    FROM core.event_outbox
  `);
  return row ?? { pending: 0, oldestAgeSeconds: 0, maxAttempts: 0 };
}
