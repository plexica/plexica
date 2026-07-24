import crypto from 'node:crypto';

import { query } from '../db.js';
import logger from '../logger.js';

import type { FastifyInstance, FastifyRequest } from 'fastify';

interface EventAttempt {
  correlationId: string | null;
  eventType: string | null;
}

const eventAttempts = new Map<string, EventAttempt[]>();

export default async function eventsRoutes(fastify: FastifyInstance) {
  fastify.get('/attempts/:eventId', async (request, reply) => {
    if (!process.env['E2E_FAIL_EVENT_PREFIX']) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const { eventId } = request.params as { eventId: string };
    const attempts = eventAttempts.get(eventId) ?? [];
    return { eventId, count: attempts.length, attempts };
  });

  fastify.post('/', async (request: FastifyRequest, reply) => {
    const headerWorkspaceId = request.headers['x-plexica-workspace-id'];
    const correlationId = request.headers['x-plexica-correlation-id'];
    const body = request.body as {
      eventId?: string;
      type?: string;
      schemaVersion?: number;
      tenantId?: string;
      occurredAt?: string;
      payload?: { workspaceId?: string; id?: string; name?: string };
      correlationId?: string;
      causationId?: string | null;
    };
    const eventType = body.type;
    if (
      typeof body.eventId !== 'string' ||
      body.schemaVersion !== 1 ||
      typeof body.tenantId !== 'string' ||
      typeof body.occurredAt !== 'string' ||
      typeof body.correlationId !== 'string'
    ) {
      return reply.status(400).send({ received: false });
    }

    // The event-dispatcher sends workspaceId in the payload, not the header.
    // Keep the header as fallback for direct calls.
    const workspaceId =
      body.payload?.workspaceId ??
      body.payload?.id ??
      (typeof headerWorkspaceId === 'string' ? headerWorkspaceId : undefined);
    const failurePrefix = process.env['E2E_FAIL_EVENT_PREFIX'];
    const workspaceName = body.payload?.name;

    if (
      failurePrefix &&
      eventType === 'plexica.workspace.created' &&
      typeof workspaceId === 'string' &&
      typeof workspaceName === 'string' &&
      workspaceName.startsWith(failurePrefix)
    ) {
      const attempts = eventAttempts.get(workspaceId) ?? [];
      attempts.push({
        correlationId: typeof correlationId === 'string' ? correlationId : null,
        eventType: eventType ?? null,
      });
      eventAttempts.set(workspaceId, attempts);
    }

    logger.info({ eventType, workspaceId, correlationId }, 'Event received');

    if (
      eventType === 'plexica.workspace.created' &&
      failurePrefix &&
      typeof workspaceName === 'string' &&
      workspaceName.startsWith(failurePrefix)
    ) {
      return reply.status(500).send({ received: false });
    }

    if (eventType === 'plexica.workspace.created' && typeof workspaceId === 'string') {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await query(
        `WITH claimed AS (
           INSERT INTO crm_processed_events (event_id) VALUES ($1)
           ON CONFLICT (event_id) DO NOTHING RETURNING event_id
         )
         INSERT INTO crm_deals (id, workspace_id, contact_id, title, value, stage, created_at, updated_at)
         SELECT $2, $3, $4, $5, $6, $7, $8, $9 FROM claimed
         ON CONFLICT (workspace_id) WHERE title = 'Default Pipeline' AND contact_id IS NULL
         DO NOTHING`,
        [body.eventId, id, workspaceId, null, 'Default Pipeline', 0, 'new', now, now]
      );

      logger.info({ workspaceId }, 'Created default pipeline for workspace');
    }

    return { received: true };
  });
}
