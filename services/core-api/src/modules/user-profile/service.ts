// service.ts
// Business logic for the user-profile module.
// getProfile, updateProfile, uploadAvatar service functions.

import crypto from 'node:crypto';
import { Readable } from 'node:stream';


import { UserNotFoundError, FileTooLargeError } from '../../lib/app-error.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { uploadAvatar as minioUploadAvatar, getPresignedReadUrl } from '../../lib/minio-client.js';
import { validateMimeType } from '../../lib/file-upload.js';
import { syncDisplayName } from '../../lib/keycloak-admin-users.js';
import { writeAuditLog } from '../audit-log/writer.js';

import {
  findProfileByKeycloakId,
  upsertProfile,
  updateProfile as repoUpdateProfile,
  updateAvatarPath,
} from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { UpdateProfileInput, UserProfileDto } from './types.js';
import type { MultipartFile } from '@fastify/multipart';

const AVATAR_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function attachAvatarUrl(profile: UserProfileDto, slug: string): Promise<UserProfileDto> {
  if (profile.avatarPath === null) return profile;
  const bucketName = `tenant-${slug}`;
  const avatarUrl = await getPresignedReadUrl(bucketName, profile.avatarPath);
  return { ...profile, avatarUrl };
}

/** Reads a Readable stream into a Buffer. Throws FileTooLargeError if maxBytes exceeded. */
async function readStream(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      throw new FileTooLargeError(`File exceeds maximum allowed size of ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function getProfile(
  tenantDb: unknown,
  keycloakUserId: string,
  tenantContext: TenantContext
): Promise<UserProfileDto> {
  let profile = await findProfileByKeycloakId(tenantDb, keycloakUserId);

  if (profile === null) {
    // Auto-provision a minimal profile for the first authenticated visit.
    profile = await upsertProfile(tenantDb, {
      userId: crypto.randomUUID(),
      keycloakUserId,
      email: '', // Caller should pass user email; tolerated as empty on auto-provision
      status: 'active',
      timezone: 'UTC',
      language: 'en',
      notificationPrefs: {},
    });
    logger.info({ keycloakUserId, userId: profile.userId }, 'Auto-provisioned user profile');
  }

  return attachAvatarUrl(profile, tenantContext.slug);
}

export async function updateProfile(
  tenantDb: unknown,
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

  writeAuditLog(tenantDb, {
    actorId: existing.userId,
    actionType: 'profile.update',
    targetType: 'user_profile',
    targetId: existing.userId,
  });

  return attachAvatarUrl(updated, tenantContext.slug);
}

export async function uploadAvatar(
  tenantDb: unknown,
  keycloakUserId: string,
  file: MultipartFile,
  tenantContext: TenantContext
): Promise<{ avatarUrl: string }> {
  const profile = await findProfileByKeycloakId(tenantDb, keycloakUserId);
  if (profile === null) throw new UserNotFoundError();

  validateMimeType(file.mimetype, AVATAR_ALLOWED_MIME_TYPES);

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

  writeAuditLog(tenantDb, {
    actorId: profile.userId,
    actionType: 'profile.avatar_change',
    targetType: 'user_profile',
    targetId: profile.userId,
  });

  const bucketName = `tenant-${tenantContext.slug}`;
  const avatarUrl = await getPresignedReadUrl(bucketName, avatarPath);
  return { avatarUrl };
}
