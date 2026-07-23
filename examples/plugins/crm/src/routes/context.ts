import type { FastifyInstance } from 'fastify';

export default async function contextRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (request) => ({
    role: request.headers['x-plexica-user-role'] ?? null,
    workspaceId: request.headers['x-plexica-workspace-id'] ?? null,
  }));
}
