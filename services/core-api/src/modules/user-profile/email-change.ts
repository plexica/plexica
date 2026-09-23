// email-change.ts
// Serialized Keycloak-first email change for the user-profile module.
// Split from service.ts (Constitution Rule 4 — no file above 200 lines).
//
// Why this exists (006-11 round-2 #5/#6/#7):
// - #5: Keycloak treats addresses case-insensitively. Comparing raw strings
//   turns a case-only edit into a syncEmail + emailVerified reset. Every
//   comparison and write below uses normalizeEmail().
// - #6: two racing PATCHes can interleave Keycloak and Postgres writes and
//   split the stores. The whole re-read → sync → write runs under one row
//   lock (SELECT ... FOR UPDATE inside $transaction, mirroring the
//   notification-prefs pattern), so concurrent changes serialize per user,
//   across instances — including the compensation path.
// - #7: the local row may hold the '' auto-provisioned placeholder while
//   Keycloak has a real address. The revert target is Keycloak's own
//   previous value (captured read-only before any mutation), never the
//   local placeholder.

import { Prisma } from '../../../prisma/generated/tenant-client/index.js';
import { logger } from '../../lib/logger.js';
import { getRealmUserEmail, syncEmail } from '../../lib/keycloak-admin-users.js';

import { updateProfile as repoUpdateProfile } from './repository.js';

import type { TenantPrisma, TenantPrismaClient } from '../../lib/tenant-database.js';
import type { UserProfileDto } from './types.js';

type ProfileFields = Parameters<typeof repoUpdateProfile>[2];

/** Lowercase + trim: Keycloak-insensitive comparison and storage form. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface LockedEmailRow {
  email: string;
}

async function lockedEmail(
  tx: TenantPrisma.TransactionClient,
  userId: string
): Promise<string | undefined> {
  const rows = await tx.$queryRaw<LockedEmailRow[]>(Prisma.sql`
    SELECT email FROM user_profile WHERE user_id = ${userId}::uuid FOR UPDATE
  `);
  return rows[0]?.email;
}

/**
 * Applies an email change: Keycloak sync FIRST, then the local write in the
 * SAME row-locked transaction. Callers pass `fields` WITHOUT email set — it
 * is added here from the normalized address so the two stores converge.
 */
export async function applyEmailChange(
  tenantDb: TenantPrismaClient,
  realmName: string,
  keycloakUserId: string,
  existing: UserProfileDto,
  normalizedNext: string,
  fields: ProfileFields
): Promise<UserProfileDto> {
  const previousKcEmail = await getRealmUserEmail(realmName, keycloakUserId);

  let synced = false;
  let lockedBefore: string | null = null;
  try {
    return await tenantDb.$transaction(async (tx) => {
      lockedBefore = (await lockedEmail(tx, existing.userId)) ?? existing.email;
      if (normalizeEmail(lockedBefore) !== normalizedNext) {
        await syncEmail(realmName, keycloakUserId, normalizedNext);
        synced = true;
      }
      // Race already applied: the local write below converges on the same
      // value the winner synced, so Keycloak and Postgres still agree.
      return repoUpdateProfile(tx, existing.userId, { ...fields, email: normalizedNext });
    });
  } catch (err) {
    if (synced && lockedBefore !== null) {
      await revertWhenUntouched(
        tenantDb,
        realmName,
        keycloakUserId,
        existing.userId,
        lockedBefore,
        previousKcEmail
      );
    }
    throw err;
  }
}

/**
 * Best-effort revert, guarded by the row lock: restores Keycloak's previous
 * address ONLY when the local row still holds the pre-request value — i.e.
 * our write never landed AND no concurrent change completed after us.
 * Otherwise Keycloak already converges with the winner and a blind revert
 * would re-split the stores. Failures are logged, never rethrown.
 */
async function revertWhenUntouched(
  tenantDb: TenantPrismaClient,
  realmName: string,
  keycloakUserId: string,
  userId: string,
  lockedBefore: string,
  previousKcEmail: string
): Promise<void> {
  try {
    const current = await tenantDb.$transaction(async (tx) => lockedEmail(tx, userId));
    if (current === undefined || normalizeEmail(current) !== normalizeEmail(lockedBefore)) {
      logger.warn({ keycloakUserId }, 'Skipping Keycloak email revert: store changed concurrently');
      return;
    }
    await syncEmail(realmName, keycloakUserId, previousKcEmail).catch((rollbackErr: unknown) => {
      logger.error(
        { err: String(rollbackErr), keycloakUserId },
        'Failed to roll back Keycloak email after local write failure'
      );
    });
  } catch (guardErr: unknown) {
    logger.error(
      { err: String(guardErr), keycloakUserId },
      'Failed to guard Keycloak email revert after local write failure'
    );
  }
}
