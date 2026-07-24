import { domainEventEnvelopeSchema } from '../../../events/event-envelope.js';

import type { DomainEventEnvelope } from '../../../events/event-envelope.js';

export async function dispatchEvent(
  backendUrl: string,
  input: DomainEventEnvelope
): Promise<void> {
  const event = domainEventEnvelopeSchema.parse(input);
  const response = await fetch(`${backendUrl.replace(/\/+$/, '')}/_plexica/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Plexica-Correlation-Id': event.correlationId,
      'X-Plexica-Event-Id': event.eventId,
      'X-Plexica-Event-Type': event.type,
      'X-Plexica-Tenant-Id': event.tenantId,
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`PLUGIN_HTTP_${response.status}`);
}
