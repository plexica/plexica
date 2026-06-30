import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { query } from '../db.js';
import logger from '../logger.js';

export default async function eventsRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request: FastifyRequest) => {
    const headerWorkspaceId = request.headers['x-plexica-workspace-id'];
    const correlationId = request.headers['x-plexica-correlation-id'];
    const body = request.body as {
      type?: string;
      payload?: { workspaceId?: string; id?: string };
    };
    const eventType = body.type;

    // The event-dispatcher sends workspaceId in the payload, not the header.
    // Keep the header as fallback for direct calls.
    const workspaceId =
      body.payload?.workspaceId ??
      body.payload?.id ??
      (typeof headerWorkspaceId === 'string' ? headerWorkspaceId : undefined);

    logger.info(
      { eventType, workspaceId, correlationId },
      'Event received',
    );

    if (
      eventType === 'plexica.workspace.created' &&
      typeof workspaceId === 'string'
    ) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await query(
        `INSERT INTO crm_deals (id, workspace_id, contact_id, title, value, stage, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, workspaceId, null, 'Default Pipeline', 0, 'new', now, now],
      );

      logger.info(
        { workspaceId },
        'Created default pipeline for workspace',
      );
    }

    return { received: true };
  });
}
