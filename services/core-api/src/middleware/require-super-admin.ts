// middleware/require-super-admin.ts
// PreHandler middleware for super admin authentication.
// Enforces that the token was issued by the Keycloak master realm (ID-004).

import { config } from '../lib/config.js';
import { UnauthorizedError } from '../lib/app-error.js';

import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireSuperAdmin(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const user = request.user as { roles?: string[]; realm?: string } | undefined;

  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }

  if (user.realm !== config.KEYCLOAK_MASTER_REALM) {
    throw new UnauthorizedError('super_admin endpoints require a master realm token');
  }

  if (!user.roles?.includes('super_admin')) {
    throw new UnauthorizedError('super_admin role required');
  }
}
