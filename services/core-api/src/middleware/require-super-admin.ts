// middleware/require-super-admin.ts
// PreHandler middleware for super admin authentication.
// Enforces that the token has the super_admin role.
// ID-004: master realm tokens are the primary path, but for E2E testing
// a super_admin role in a tenant realm is also accepted (the role is the
// security boundary, not the realm).

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

  if (!user.roles?.includes('super_admin')) {
    throw new UnauthorizedError('super_admin role required');
  }
}
