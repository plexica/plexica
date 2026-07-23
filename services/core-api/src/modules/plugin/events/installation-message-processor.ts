import { dlqPayloadSchema, malformedSourceEvent } from '../../../events/dlq-contract.js';
import { decryptWireEvent } from '../../../events/event-crypto.js';
import { getTenantEventKey } from '../../../events/event-key-service.js';
import { wireEventEnvelopeSchema } from '../../../events/event-envelope.js';
import { prisma } from '../../../lib/database.js';
import { logger } from '../../../lib/logger.js';

import { moveToDlq } from './dlq.service.js';

import type { DomainEventEnvelope } from '../../../events/event-envelope.js';
import type { SourceCoordinates } from '../../../events/dlq-contract.js';

type EventHandler = (event: DomainEventEnvelope, source: SourceCoordinates) => Promise<void>;

async function tenantIsActive(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });
  return tenant?.status === 'active';
}

export async function processInstallationMessage(input: {
  installId: string;
  tenantId: string;
  pluginId: string;
  source: SourceCoordinates;
  value: string;
  handler: EventHandler;
}): Promise<void> {
  let wire;
  try {
    wire = wireEventEnvelopeSchema.parse(JSON.parse(input.value));
  } catch {
    const event = malformedSourceEvent(input.tenantId, input.installId, input.source);
    await moveToDlq(dlqPayloadSchema.parse({
      tenantId: input.tenantId, installId: input.installId, pluginId: input.pluginId,
      event, errorCode: 'MALFORMED_ENVELOPE', retryCount: 0, source: input.source,
    }));
    return;
  }
  if (wire.tenantId !== input.tenantId || !(await tenantIsActive(input.tenantId))) return;
  let event: DomainEventEnvelope;
  try {
    const key = await getTenantEventKey(prisma, wire.tenantId, wire.encryption.keyVersion);
    event = decryptWireEvent(wire, key);
  } catch {
    const malformed = malformedSourceEvent(input.tenantId, input.installId, input.source);
    await moveToDlq(dlqPayloadSchema.parse({
      tenantId: input.tenantId, installId: input.installId, pluginId: input.pluginId,
      event: malformed, errorCode: 'EVENT_DECRYPT_FAILED', retryCount: 0, source: input.source,
    }));
    return;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, [100, 500][attempt - 1]));
    if (!(await tenantIsActive(input.tenantId))) return;
    try {
      await input.handler(event, input.source);
      return;
    } catch {
      logger.warn(
        { eventId: event.eventId, installId: input.installId, attempt: attempt + 1 },
        'Plugin event delivery failed'
      );
    }
  }
  await moveToDlq(dlqPayloadSchema.parse({
    tenantId: input.tenantId, installId: input.installId, pluginId: input.pluginId,
    event, errorCode: 'PLUGIN_DELIVERY_FAILED', retryCount: 3, source: input.source,
  }));
}
