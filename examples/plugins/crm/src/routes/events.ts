// routes/events.ts
// Event ingestion endpoint for the CRM plugin backend.
//
// Architecture (post-SDK adoption, ADR-019, 2026-08-18):
// - Business logic handlers are registered via sdk.onEvent() at module load.
// - The HTTP POST route validates the envelope, handles E2E failure simulation,
//   then delegates to sdk.dispatchEvent() which calls registered handlers.
// - The failure simulation (E2E_FAIL_EVENT_PREFIX) stays OUTSIDE the SDK dispatch
//   because it controls the HTTP response code — the SDK is runtime-agnostic.

import crypto from 'node:crypto';

import { sdk } from '../sdk.js';
import { query } from '../db.js';
import logger from '../logger.js';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PluginEvent } from '@plexica/sdk';

interface EventAttempt {
  correlationId: string | null;
  eventType: string | null;
}

const eventAttempts = new Map<string, EventAttempt[]>();

// Register the workspace.created handler via the SDK.
// This is the dogfooding path: the SDK's onEvent/dispatchEvent pattern is
// exercised by the CRM's E2E tests (ac-04-crm-workflow.spec.ts).
sdk.onEvent('plexica.workspace.created', async (event) => {
  const payload = event.payload as { workspaceId?: string; id?: string } | undefined;
  const workspaceId = payload?.workspaceId ?? payload?.id;
  if (typeof workspaceId !== 'string') return;

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
    [event.eventId, id, workspaceId, null, 'Default Pipeline', 0, 'new', now, now],
  );

  logger.info({ workspaceId }, 'Created default pipeline for workspace');
});

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

    if (
      typeof body.eventId !== 'string' ||
      body.schemaVersion !== 1 ||
      typeof body.tenantId !== 'string' ||
      typeof body.occurredAt !== 'string' ||
      typeof body.correlationId !== 'string'
    ) {
      return reply.status(400).send({ received: false });
    }

    const headerWorkspaceId = request.headers['x-plexica-workspace-id'];
    const workspaceId =
      body.payload?.workspaceId ??
      body.payload?.id ??
      (typeof headerWorkspaceId === 'string' ? headerWorkspaceId : undefined);
    const failurePrefix = process.env['E2E_FAIL_EVENT_PREFIX'];
    const workspaceName = body.payload?.name;

    // E2E failure simulation: track attempts and return 500 for matching names.
    if (
      failurePrefix &&
      body.type === 'plexica.workspace.created' &&
      typeof workspaceId === 'string' &&
      typeof workspaceName === 'string' &&
      workspaceName.startsWith(failurePrefix)
    ) {
      const attempts = eventAttempts.get(workspaceId) ?? [];
      attempts.push({
        correlationId: typeof correlationId === 'string' ? correlationId : null,
        eventType: body.type ?? null,
      });
      eventAttempts.set(workspaceId, attempts);
    }

    logger.info({ eventType: body.type, workspaceId, correlationId }, 'Event received');

    if (
      body.type === 'plexica.workspace.created' &&
      failurePrefix &&
      typeof workspaceName === 'string' &&
      workspaceName.startsWith(failurePrefix)
    ) {
      return reply.status(500).send({ received: false });
    }

    // Delegate to the SDK: dispatchEvent calls handlers registered via onEvent().
    const event: PluginEvent = {
      eventId: body.eventId,
      type: body.type ?? '',
      schemaVersion: 1,
      tenantId: body.tenantId,
      occurredAt: body.occurredAt,
      producer: { kind: 'core', id: 'core' },
      payload: body.payload,
      correlationId: body.correlationId,
      causationId: body.causationId ?? null,
    };
    await sdk.dispatchEvent(event);

    return { received: true };
  });
}
