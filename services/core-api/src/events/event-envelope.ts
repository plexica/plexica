import { z } from 'zod';

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ])
);
export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(jsonValueSchema);

const coreProducerSchema = z.object({
  kind: z.literal('core'),
  id: z.literal('core'),
}).strict();

const pluginProducerSchema = z.object({
  kind: z.literal('plugin'),
  id: z.string().uuid(),
}).strict();

export const eventMetadataSchema = z.object({
  eventId: z.string().uuid(),
  type: z.string().min(1).max(128).regex(/^[a-z][a-z0-9.-]+$/),
  schemaVersion: z.literal(1),
  tenantId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  producer: z.union([coreProducerSchema, pluginProducerSchema]),
  correlationId: z.string().uuid(),
  causationId: z.string().uuid().nullable(),
}).strict();

export const domainEventEnvelopeSchema = eventMetadataSchema.extend({
  payload: jsonObjectSchema,
}).strict();

const base64UrlSchema = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/);

export const wireEventEnvelopeSchema = eventMetadataSchema.extend({
  encryption: z.object({
    algorithm: z.literal('A256GCM'),
    keyVersion: z.number().int().positive(),
    iv: base64UrlSchema,
    tag: base64UrlSchema,
  }).strict(),
  ciphertext: base64UrlSchema,
}).strict();

export type EventMetadata = z.infer<typeof eventMetadataSchema>;
export type DomainEventEnvelope = z.infer<typeof domainEventEnvelopeSchema>;
export type WireEventEnvelope = z.infer<typeof wireEventEnvelopeSchema>;

interface BuildEventInput {
  type: string;
  tenantId: string;
  producer: DomainEventEnvelope['producer'];
  payload: JsonObject;
  eventId?: string;
  correlationId?: string;
  causationId?: string | null;
  occurredAt?: string;
}

export function buildDomainEvent(input: BuildEventInput): DomainEventEnvelope {
  return domainEventEnvelopeSchema.parse({
    eventId: input.eventId ?? crypto.randomUUID(),
    type: input.type,
    schemaVersion: 1,
    tenantId: input.tenantId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    producer: input.producer,
    correlationId: input.correlationId ?? crypto.randomUUID(),
    causationId: input.causationId ?? null,
    payload: input.payload,
  });
}

export function eventMetadata(event: DomainEventEnvelope | WireEventEnvelope): EventMetadata {
  return eventMetadataSchema.parse({
    eventId: event.eventId,
    type: event.type,
    schemaVersion: event.schemaVersion,
    tenantId: event.tenantId,
    occurredAt: event.occurredAt,
    producer: event.producer,
    correlationId: event.correlationId,
    causationId: event.causationId,
  });
}
