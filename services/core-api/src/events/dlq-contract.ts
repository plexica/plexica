import { createHash } from 'node:crypto';

import { z } from 'zod';

import { buildDomainEvent, domainEventEnvelopeSchema } from './event-envelope.js';

import type { DomainEventEnvelope, JsonObject } from './event-envelope.js';

export const sourceCoordinatesSchema = z.object({
  topic: z.string().min(1).max(128),
  partition: z.number().int().nonnegative(),
  offset: z.string().regex(/^\d+$/),
}).strict();

export const dlqPayloadSchema = z.object({
  tenantId: z.string().uuid(),
  installId: z.string().uuid(),
  pluginId: z.string().uuid(),
  event: domainEventEnvelopeSchema,
  errorCode: z.string().min(1).max(64),
  errorDetail: z.string().max(512).optional(),
  retryCount: z.number().int().nonnegative(),
  source: sourceCoordinatesSchema,
}).strict();

export type SourceCoordinates = z.infer<typeof sourceCoordinatesSchema>;
export type DlqPayload = z.infer<typeof dlqPayloadSchema>;

export function dlqDedupeKey(installId: string, source: SourceCoordinates): string {
  return createHash('sha256')
    .update(`${installId}\n${source.topic}\n${source.partition}\n${source.offset}`)
    .digest('hex');
}

export function coordinateEventId(installId: string, source: SourceCoordinates): string {
  const bytes = createHash('sha256')
    .update(`${installId}\n${source.topic}\n${source.partition}\n${source.offset}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes.at(6) ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes.at(8) ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function malformedSourceEvent(
  tenantId: string,
  installId: string,
  source: SourceCoordinates
): DomainEventEnvelope {
  const eventId = coordinateEventId(installId, source);
  return buildDomainEvent({
    eventId,
    type: 'plexica.event.malformed',
    tenantId,
    producer: { kind: 'core', id: 'core' },
    correlationId: eventId,
    payload: { reasonCode: 'MALFORMED_ENVELOPE' },
  });
}

export function dlqPayloadAsJson(payload: DlqPayload): JsonObject {
  return dlqPayloadSchema.parse(payload) as JsonObject;
}
