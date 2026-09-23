// avatar.ts
// Avatar and Keycloak account-URL enrichment for the user-profile module
// (006-12/006-14). Split from service.ts (Constitution Rule 4).

import { Readable } from 'node:stream';

import { UserNotFoundError } from '../../lib/app-error.js';
import { config } from '../../lib/config.js';
import { readStream } from '../../lib/file-upload.js';
import {
  uploadAvatar as storageUploadAvatar,
  getPresignedReadUrl,
} from '../../lib/storage-client.js';
import { writeAuditLog } from '../audit-log/writer.js';

import { findProfileByKeycloakId, updateAvatarPath } from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { TenantPrismaClient } from '../../lib/tenant-database.js';
import type { UserProfileDto } from './types.js';
import type { MultipartFile } from '@fastify/multipart';

async function attachAvatarUrl(profile: UserProfileDto, slug: string): Promise<UserProfileDto> {
  if (profile.avatarPath === null) return profile;
  const bucketName = `tenant-${slug}`;
  const avatarUrl = await getPresignedReadUrl(bucketName, profile.avatarPath);
  return { ...profile, avatarUrl };
}

/** Per-realm Keycloak account console URL (006-14) from the config pattern. */
export function keycloakAccountUrl(realmName: string): string {
  return config.KEYCLOAK_ACCOUNT_URL_PATTERN.replace('{realm}', realmName);
}

/**
 * Enriches a profile DTO with the computed fields (006-12/006-14): the JWT
 * `picture` claim wins over the uploaded avatar; the account URL is always set.
 */
export async function enrichProfile(
  profile: UserProfileDto,
  slug: string,
  realmName: string,
  jwtPicture: string | undefined
): Promise<UserProfileDto> {
  const accountUrl = keycloakAccountUrl(realmName);
  if (jwtPicture !== undefined && jwtPicture !== '') {
    return {
      ...profile,
      avatarUrl: jwtPicture,
      avatarSource: 'keycloak',
      keycloakAccountUrl: accountUrl,
    };
  }
  const withUpload = await attachAvatarUrl(profile, slug);
  return { ...withUpload, avatarSource: 'upload', keycloakAccountUrl: accountUrl };
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

  // Buffer the stream to validate size before uploading to object storage.
  const fileBytes = await readStream(file.file as unknown as Readable, config.AVATAR_MAX_BYTES);

  const avatarPath = await storageUploadAvatar(
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
