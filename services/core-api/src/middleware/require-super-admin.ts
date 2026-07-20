// middleware/require-super-admin.ts
// PreHandler middleware for super admin authentication.
// Enforces BOTH:
//   1. The token has the super_admin role
//   2. The token was issued by the Keycloak master realm
//
// H-03 fix: a tenant admin who creates a 'super_admin' role in their own
// tenant realm cannot call admin routes — only tokens from
// KEYCLOAK_MASTER_REALM are accepted. The realm check is the security
// boundary, not just the role name.

import { UnauthorizedError } from '../lib/app-error.js';
import { config } from '../lib/config.js';

import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireSuperAdmin(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const user = request.user;

  if (user === undefined) {
    throw new UnauthorizedError('Authentication required');
  }

  if (user.realm !== config.KEYCLOAK_MASTER_REALM) {
    throw new UnauthorizedError('super_admin endpoints require a master realm token');
  }

  if (!user.roles.includes('super_admin')) {
    throw new UnauthorizedError('super_admin role required');
  }
}
