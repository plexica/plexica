// user-routes.ts
// GET /api/me — returns the authenticated user's profile.
// Requires auth middleware (preHandler: authMiddleware).

import { authMiddleware } from '../../middleware/auth-middleware.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';


const userRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/api/me', { preHandler: [authMiddleware] }, async (request) => {
    const { id, email, firstName, lastName, realm, roles } = request.user;
    return { id, email, firstName, lastName, realm, roles };
  });
};

export default userRoutes;
