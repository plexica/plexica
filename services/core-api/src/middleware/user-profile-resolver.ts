// user-profile-resolver.ts
// Fastify preHandler middleware — resolves the Keycloak user ID (JWT sub)
// to the internal user_profile.user_id for the current tenant schema.
//
// Problem: auth-middleware.ts sets req.user.id = JWT sub (Keycloak UUID).
// Tenant-schema tables (workspace, audit_log, workspace_member, invitation)
// have FK constraints referencing user_profile(user_id), which is a separate
// internal UUID. Without this middleware, any write operation using req.user.id
// as a FK value fails with "Foreign key constraint violated".
//
// Solution: after auth + tenant context are established, this middleware
// looks up the user_profile by keycloak_user_id. If no profile exists
// (first authenticated visit), it auto-provisions one. Then it replaces
// req.user.id with the internal user_profile.user_id so all downstream
// code (routes, services, ABAC) uses the correct FK-compatible ID.

import crypto from 'node:crypto';

import { logger } from '../lib/logger.js';
import { withTenantDb } from '../lib/tenant-database.js';

import type { FastifyReply, FastifyRequest } from 'fastify';

export async function userProfileResolver(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Skip if no tenant context (admin routes, public routes)
  if (request.tenantContext === undefined) return;

  const keycloakUserId = request.user.id;

  const internalUserId = await withTenantDb(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = tx as any;

    // Upsert to avoid TOCTOU race: two concurrent requests for a new user
    // both attempt findUnique → null → create, and the second fails with a
    // unique constraint violation. Upsert is atomic at the DB level.
    const newUserId = crypto.randomUUID();
    const profile = await db.userProfile.upsert({
      where: { keycloakUserId },
      update: {},
      create: {
        userId: newUserId,
        keycloakUserId,
        email: request.user.email ?? '',
        displayName:
          [request.user.firstName, request.user.lastName].filter(Boolean).join(' ') || null,
        timezone: 'UTC',
        language: 'en',
        status: 'active',
      },
      select: { userId: true },
    });

    // Log only on first provision (userId matches the one we generated)
    if (profile.userId === newUserId) {
      logger.info('Auto-provisioned user profile on first tenant visit');
    }

    return profile.userId as string;
  }, request.tenantContext);

  // Replace the Keycloak sub with the internal user_profile.user_id
  // so all downstream code uses the FK-compatible ID.
  request.user.id = internalUserId;
}
