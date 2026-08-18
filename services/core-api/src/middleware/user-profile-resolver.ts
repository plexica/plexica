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
//
// SECURITY BACKSTOP (fail-closed): this middleware is also the point where a
// user who has been removed from the tenant is refused. Every other gate on
// that path fails OPEN:
//   - auth-middleware.ts only verifies the JWT signature against JWKS (no
//     introspection), so the token stays valid until `exp`;
//   - removeUser()'s Keycloak disable + session termination are best-effort
//     and their failures are only logged;
//   - the ABAC membership cache is revoked by removeUser(), but that revocation
//     depends on Redis being reachable.
// The check below depends on none of those: it reads the tenant schema on the
// request path, so a soft-deleted or disabled profile is rejected on the very
// next request regardless of cache TTL, Redis health or Keycloak health.

import crypto from 'node:crypto';

import { logger } from '../lib/logger.js';
import { ForbiddenError } from '../lib/app-error.js';
import { withTenantDb } from '../lib/tenant-database.js';

import type { FastifyReply, FastifyRequest } from 'fastify';

interface ResolvedProfile {
  userId: string;
  status: string;
  deletedAt: Date | null;
}

// user_profile.status is one of 'active' | 'invited' | 'disabled'
// (see prisma/tenant-schema/core-models.prisma and user-management/schema.ts).
//
// 'invited' MUST stay allowed: the invitation accept flow creates the profile
// with status='invited' (modules/invitation/service-accept.ts) and the account
// keeps that status through the invitee's first authenticated request. Denying
// it would lock every freshly invited user out of the app.
//
// Auto-provisioned profiles are created below with status='active', so a brand
// new first-login user is unaffected either way.
const ALLOWED_PROFILE_STATUSES = new Set(['active', 'invited']);

function assertProfileUsable(profile: ResolvedProfile, tenantSlug: string): void {
  // Soft-deleted (removeUser sets deleted_at + status='disabled') or otherwise
  // disabled accounts must not resolve to a usable internal user id.
  // No PII in the log — tenant slug and reason only (AGENTS.md § Sicurezza 6).
  if (profile.deletedAt !== null) {
    logger.warn({ tenantSlug }, 'Rejected request from a soft-deleted user profile');
    throw new ForbiddenError('User account has been removed from this tenant');
  }

  if (!ALLOWED_PROFILE_STATUSES.has(profile.status)) {
    logger.warn({ tenantSlug, status: profile.status }, 'Rejected request from a disabled profile');
    throw new ForbiddenError('User account is disabled in this tenant');
  }
}

export async function userProfileResolver(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Skip if no tenant context (admin routes, public routes)
  if (request.tenantContext === undefined) return;

  const keycloakUserId = request.user.id;

  const profile = await withTenantDb(async (db) => {
    // Upsert to avoid TOCTOU race: two concurrent requests for a new user
    // both attempt findUnique → null → create, and the second fails with a
    // unique constraint violation. Upsert is atomic at the DB level.
    //
    // `update: {}` means an existing row is returned untouched — including a
    // soft-deleted one, which is exactly why deletedAt/status are selected and
    // asserted below instead of being assumed clean.
    const newUserId = crypto.randomUUID();
    const row = await db.userProfile.upsert({
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
      select: { userId: true, status: true, deletedAt: true },
    });

    // Log only on first provision (userId matches the one we generated)
    if (row.userId === newUserId) {
      logger.info('Auto-provisioned user profile on first tenant visit');
    }

    return row;
  }, request.tenantContext);

  assertProfileUsable(profile, request.tenantContext.slug);

  // Replace the Keycloak sub with the internal user_profile.user_id
  // so all downstream code uses the FK-compatible ID.
  request.user.id = profile.userId;
}
