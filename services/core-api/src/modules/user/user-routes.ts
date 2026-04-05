// user-routes.ts
// GET /api/me — returns the authenticated user's profile.
// Auth is provided by the scope-level authMiddleware hook registered in index.ts
// (tenantScope). No need to re-declare authMiddleware here.
//
// Rate limiting: 120 req/min per user (hook: 'preHandler' so request.user is
// already populated by authMiddleware before the key generator runs).

import { rateLimitKey } from '../../lib/rate-limit-key.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const userRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get(
    '/api/me',
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: rateLimitKey,
        },
      },
    },
    async (request) => {
      const { id, email, firstName, lastName, realm, roles } = request.user;
      return { id, email, firstName, lastName, realm, roles };
    }
  );
};

export default userRoutes;
