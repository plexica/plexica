import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { query, queryOne } from '../db.js';
import type { Contact } from '../stores.js';

interface ContactRow {
  id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function toContact(row: unknown): Contact {
  const r = row as ContactRow;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    notes: r.notes,
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

export default async function contactsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request) => {
    const workspaceId = getWorkspaceId(request);
    const rows = await query(
      'SELECT * FROM crm_contacts WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId],
    );
    return rows.map(toContact);
  });

  fastify.post<{
    Body: { name: string; email?: string; phone?: string; notes?: string };
  }>('/', async (request, reply) => {
    const workspaceId = getWorkspaceId(request);
    const { name, email, phone, notes } = request.body;

    if (!name || typeof name !== 'string') {
      return reply.status(400).send({ error: 'Name is required' });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const [row] = await query(
      `INSERT INTO crm_contacts (id, workspace_id, name, email, phone, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, workspaceId, name, email ?? null, phone ?? null, notes ?? null, now, now],
    );

    return reply.status(201).send(toContact(row));
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const workspaceId = getWorkspaceId(request);
    const row = await queryOne(
      'SELECT * FROM crm_contacts WHERE id = $1 AND workspace_id = $2',
      [request.params.id, workspaceId],
    );

    if (!row) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    return toContact(row);
  });

  fastify.put<{
    Params: { id: string };
    Body: { name?: string; email?: string; phone?: string; notes?: string };
  }>('/:id', async (request, reply) => {
    const workspaceId = getWorkspaceId(request);
    const existing = await queryOne(
      'SELECT * FROM crm_contacts WHERE id = $1 AND workspace_id = $2',
      [request.params.id, workspaceId],
    );

    if (!existing) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    const { name, email, phone, notes } = request.body;
    const now = new Date().toISOString();
    const r = existing as unknown as ContactRow;

    const [row] = await query(
      `UPDATE crm_contacts
       SET name = $1, email = $2, phone = $3, notes = $4, updated_at = $5
       WHERE id = $6 AND workspace_id = $7
       RETURNING *`,
      [
        name ?? r.name,
        email !== undefined ? email : r.email,
        phone !== undefined ? phone : r.phone,
        notes !== undefined ? notes : r.notes,
        now,
        request.params.id,
        workspaceId,
      ],
    );

    return toContact(row);
  });

  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const workspaceId = getWorkspaceId(request);
      const existing = await queryOne(
        'SELECT id FROM crm_contacts WHERE id = $1 AND workspace_id = $2',
        [request.params.id, workspaceId],
      );

      if (!existing) {
        return reply.status(404).send({ error: 'Contact not found' });
      }

      await query(
        'DELETE FROM crm_contacts WHERE id = $1 AND workspace_id = $2',
        [request.params.id, workspaceId],
      );

      return reply.status(204).send();
    },
  );
}
