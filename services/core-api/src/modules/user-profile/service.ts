// service.ts
// Business logic for the user-profile module.
// getProfile, updateProfile service functions (006-11/12/14).
// Avatar operations live in avatar.ts, session orchestration in sessions.ts
// (Constitution Rule 4 — no file above 200 lines).

import crypto from 'node:crypto';

import { UserNotFoundError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';
import { syncDisplayName, syncEmail } from '../../lib/keycloak-admin-users.js';
import { writeAuditLog } from '../audit-log/writer.js';

import { enrichProfile } from './avatar.js';
import {
  findProfileByKeycloakId,
  upsertProfile,
  updateProfile as repoUpdateProfile,
} from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { TenantDbClient, TenantPrismaClient } from '../../lib/tenant-database.js';
import type { UpdateProfileInput, UserProfileDto } from './types.js';

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function getProfile(
  tenantDb: TenantDbClient,
  keycloakUserId: string,
  tenantContext: TenantContext,
  jwtPicture?: string | undefined
): Promise<UserProfileDto> {
  let profile = await findProfileByKeycloakId(tenantDb, keycloakUserId);

  if (profile === null) {
    // Auto-provision a minimal profile for the first authenticated visit.
    // Concurrent first visits race the upsert (Prisma emulates it as
    // insert-or-update and the loser surfaces P2002); re-read instead of
    // failing the request.
    try {
      profile = await upsertProfile(tenantDb, {
        userId: crypto.randomUUID(),
        keycloakUserId,
        email: '', // Caller should pass user email; tolerated as empty on auto-provision
        status: 'active',
        timezone: 'UTC',
        language: 'en',
        notificationPrefs: {},
      });
    } catch (error) {
      const isUniqueViolation =
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
      if (!isUniqueViolation) throw error;
      const winner = await findProfileByKeycloakId(tenantDb, keycloakUserId);
      if (winner === null) throw error;
      profile = winner;
    }
    logger.info({ keycloakUserId, userId: profile.userId }, 'Auto-provisioned user profile');
  }

  return enrichProfile(profile, tenantContext.slug, tenantContext.realmName, jwtPicture);
}

// TenantPrismaClient (non-transactional): writes the audit log.
export async function updateProfile(
  tenantDb: TenantPrismaClient,
  keycloakUserId: string,
  input: UpdateProfileInput,
  tenantContext: TenantContext,
  jwtPicture?: string | undefined
): Promise<UserProfileDto> {
  const existing = await findProfileByKeycloakId(tenantDb, keycloakUserId);
  if (existing === null) throw new UserNotFoundError();

  // Keycloak-first email sync (006-11): the upstream call runs BEFORE any
  // local write. A rejection throws here, so neither the email NOR the other
  // fields are persisted — the local profile can never diverge from Keycloak.
  // The email then rides in the SAME Prisma update as the other fields: one
  // atomic write, no crash window between two sequential writes.
  const fields: Parameters<typeof repoUpdateProfile>[2] = {};
  if ('displayName' in input) fields.displayName = input.displayName;
  if (input.timezone !== undefined) fields.timezone = input.timezone;
  if (input.language !== undefined) fields.language = input.language;

  const nextEmail = input.email;
  if (nextEmail !== undefined && nextEmail !== existing.email) {
    await syncEmail(tenantContext.realmName, keycloakUserId, nextEmail);
    fields.email = nextEmail;
  }

  const updated = await repoUpdateProfile(tenantDb, existing.userId, fields);

  // Sync display name to Keycloak — fire-and-forget; failures are logged only.
  if (input.displayName !== undefined && input.displayName !== null) {
    syncDisplayName(tenantContext.realmName, keycloakUserId, input.displayName).catch(
      (err: unknown) => {
        logger.warn(
          { err: String(err), keycloakUserId },
          'Failed to sync display name to Keycloak'
        );
      }
    );
  }

  await writeAuditLog(tenantDb, {
    actorId: existing.userId,
    actionType: 'profile.update',
    targetType: 'user_profile',
    targetId: existing.userId,
  });

  return enrichProfile(updated, tenantContext.slug, tenantContext.realmName, jwtPicture);
}
