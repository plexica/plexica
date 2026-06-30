import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { query, queryOne } from '../db.js';
import type { Deal } from '../stores.js';

interface DealRow {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  title: string;
  value: unknown;
  stage: string;
  created_at: string;
  updated_at: string;
}

function toDeal(row: unknown): Deal {
  const r = row as DealRow;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    contactId: r.contact_id,
    title: r.title,
    value: Number(r.value),
    stage: r.stage,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function getWorkspaceId(request: FastifyRequest): string {
  const id = request.headers['x-plexica-workspace-id'];
  if (typeof id !== 'string' || !id) {
    throw new Error('Missing X-Plexica-Workspace-Id header');
  }
  return id;
}

export default async function dealsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request) => {
    const workspaceId = getWorkspaceId(request);
    const rows = await query(
      'SELECT * FROM crm_deals WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId],
    );
    return rows.map(toDeal);
  });

  fastify.post<{
    Body: { title: string; value?: number; stage?: string; contactId?: string };
  }>('/', async (request, reply) => {
    const workspaceId = getWorkspaceId(request);
    const { title, value, stage, contactId } = request.body;

    if (!title || typeof title !== 'string') {
      return reply.status(400).send({ error: 'Title is required' });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const [row] = await query(
      `INSERT INTO crm_deals (id, workspace_id, contact_id, title, value, stage, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        workspaceId,
        contactId ?? null,
        title,
        value ?? 0,
        stage ?? 'new',
        now,
        now,
      ],
    );

    return reply.status(201).send(toDeal(row));
  });

  fastify.get('/count', async (request) => {
    const workspaceId = getWorkspaceId(request);
    const rows = await query(
      'SELECT COUNT(*)::int AS count FROM crm_deals WHERE workspace_id = $1',
      [workspaceId],
    );
    const countValue = rows[0] as { count: number } | undefined;
    return { count: countValue?.count ?? 0 };
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const workspaceId = getWorkspaceId(request);
    const row = await queryOne(
      'SELECT * FROM crm_deals WHERE id = $1 AND workspace_id = $2',
      [request.params.id, workspaceId],
    );

    if (!row) {
      return reply.status(404).send({ error: 'Deal not found' });
    }

    return toDeal(row);
  });

  fastify.put<{
    Params: { id: string };
    Body: {
      title?: string;
      value?: number;
      stage?: string;
      contactId?: string;
    };
  }>('/:id', async (request, reply) => {
    const workspaceId = getWorkspaceId(request);
    const existing = await queryOne(
      'SELECT * FROM crm_deals WHERE id = $1 AND workspace_id = $2',
      [request.params.id, workspaceId],
    );

    if (!existing) {
      return reply.status(404).send({ error: 'Deal not found' });
    }

    const { title, value, stage, contactId } = request.body;
    const now = new Date().toISOString();
    const r = existing as unknown as DealRow;

    const [row] = await query(
      `UPDATE crm_deals
       SET title = $1, value = $2, stage = $3, contact_id = $4, updated_at = $5
       WHERE id = $6 AND workspace_id = $7
       RETURNING *`,
      [
        title ?? r.title,
        value !== undefined ? value : Number(r.value),
        stage ?? r.stage,
        contactId !== undefined ? contactId : r.contact_id,
        now,
        request.params.id,
        workspaceId,
      ],
    );

    return toDeal(row);
  });

  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const workspaceId = getWorkspaceId(request);
      const existing = await queryOne(
        'SELECT id FROM crm_deals WHERE id = $1 AND workspace_id = $2',
        [request.params.id, workspaceId],
      );

      if (!existing) {
        return reply.status(404).send({ error: 'Deal not found' });
      }

      await query(
        'DELETE FROM crm_deals WHERE id = $1 AND workspace_id = $2',
        [request.params.id, workspaceId],
      );

      return reply.status(204).send();
    },
  );
}
