import type { FastifyInstance, FastifyRequest } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    return { status: 'healthy', version: '1.0.0' };
  });

  fastify.get('/ready', async () => {
    return { status: 'ready' };
  });
}
