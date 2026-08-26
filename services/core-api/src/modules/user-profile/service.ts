// service.ts
// Business logic for the user-profile module.
// getProfile, updateProfile, uploadAvatar service functions.

import crypto from 'node:crypto';
import { Readable } from 'node:stream';


import { UserNotFoundError } from '../../lib/app-error.js';
import { config } from '../../lib/config.js';
import { readStream } from '../../lib/file-upload.js';
import { logger } from '../../lib/logger.js';
import { uploadAvatar as minioUploadAvatar, getPresignedReadUrl } from '../../lib/minio-client.js';
import { syncDisplayName } from '../../lib/keycloak-admin-users.js';
import { writeAuditLog } from '../audit-log/writer.js';

import {
  findProfileByKeycloakId,
  upsertProfile,
  updateProfile as repoUpdateProfile,
  updateAvatarPath,
} from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { TenantDbClient, TenantPrismaClient } from '../../lib/tenant-database.js';
import type { UpdateProfileInput, UserProfileDto } from './types.js';
import type { MultipartFile } from '@fastify/multipart';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function attachAvatarUrl(profile: UserProfileDto, slug: string): Promise<UserProfileDto> {
  if (profile.avatarPath === null) return profile;
  const bucketName = `tenant-${slug}`;
  const avatarUrl = await getPresignedReadUrl(bucketName, profile.avatarPath);
  return { ...profile, avatarUrl };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function getProfile(
  tenantDb: TenantDbClient,
  keycloakUserId: string,
  tenantContext: TenantContext
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

  return attachAvatarUrl(profile, tenantContext.slug);
}

// TenantPrismaClient (non-transactional): writes the audit log.
export async function updateProfile(
  tenantDb: TenantPrismaClient,
  keycloakUserId: string,
  input: UpdateProfileInput,
  tenantContext: TenantContext
): Promise<UserProfileDto> {
  const existing = await findProfileByKeycloakId(tenantDb, keycloakUserId);
  if (existing === null) throw new UserNotFoundError();

  const fields: Parameters<typeof repoUpdateProfile>[2] = {};
  if ('displayName' in input) fields.displayName = input.displayName;
  if (input.timezone !== undefined) fields.timezone = input.timezone;
  if (input.language !== undefined) fields.language = input.language;
  if (input.notificationPrefs !== undefined) fields.notificationPrefs = input.notificationPrefs;

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

  return attachAvatarUrl(updated, tenantContext.slug);
}

// TenantPrismaClient (non-transactional): writes the audit log.
export async function uploadAvatar(
  tenantDb: TenantPrismaClient,
  keycloakUserId: string,
  file: MultipartFile,
  tenantContext: TenantContext
): Promise<{ avatarUrl: string }> {
  const profile = await findProfileByKeycloakId(tenantDb, keycloakUserId);
  if (profile === null) throw new UserNotFoundError();

  // No mime/content validation here: routes.ts (the only caller) already runs
  // the authoritative `validateFileContent` check — allowlist, magic-byte
  // sniffing, SVG active-content scan — on these exact bytes before this
  // function is invoked. Re-declaring a weaker, client-Content-Type-only
  // check here would be redundant at best and a stale, unenforced allowlist
  // at worst (see history: this used to duplicate the constant and never
  // stayed in sync with lib/file-upload.ts).

  // Buffer the stream to validate size before uploading to MinIO.
  const fileBytes = await readStream(file.file as unknown as Readable, config.AVATAR_MAX_BYTES);

  const avatarPath = await minioUploadAvatar(
    tenantContext.slug,
    profile.userId,
    Readable.from(fileBytes),
    file.mimetype,
    fileBytes.length
  );

  await updateAvatarPath(tenantDb, profile.userId, avatarPath);

  await writeAuditLog(tenantDb, {
    actorId: profile.userId,
    actionType: 'profile.avatar_change',
    targetType: 'user_profile',
    targetId: profile.userId,
  });

  const bucketName = `tenant-${tenantContext.slug}`;
  const avatarUrl = await getPresignedReadUrl(bucketName, avatarPath);
  return { avatarUrl };
}
