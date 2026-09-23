// repository.ts
// Tenant-schema data access layer for the user_profile table.
// All functions accept a tenant-schema Prisma client (TenantDbClient, ADR-028):
// normally the plain one handed out by withTenantDb(), bound to the schema via
// `?schema=<schemaName>` — NOT a transaction client. Nothing here is atomic
// unless the caller opened a $transaction.

import type { TenantDbClient, TenantPrisma } from '../../lib/tenant-database.js';
import type { NotificationPrefs, UserProfileDto } from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface UserProfileRow {
  userId: string;
  keycloakUserId: string;
  email: string;
  displayName: string | null;
  avatarPath: string | null;
  timezone: string;
  language: string;
  notificationPrefs: TenantPrisma.JsonValue;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function rowToDto(row: UserProfileRow): UserProfileDto {
  return {
    userId: row.userId,
    keycloakUserId: row.keycloakUserId,
    email: row.email,
    displayName: row.displayName,
    avatarPath: row.avatarPath,
    avatarUrl: null, // Populated by service layer via getPresignedReadUrl()
    avatarSource: 'upload', // Overwritten by the service layer when a picture claim wins
    keycloakAccountUrl: '', // Overwritten by the service layer (per-realm account console URL)
    timezone: row.timezone,
    language: row.language,
    notificationPrefs: (row.notificationPrefs as unknown as NotificationPrefs) ?? {},
    status: row.status as UserProfileDto['status'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public repository functions
// ---------------------------------------------------------------------------

export async function findProfileByKeycloakId(
  db: TenantDbClient,
  keycloakUserId: string
): Promise<UserProfileDto | null> {
  const row = await db.userProfile.findUnique({
    where: { keycloakUserId },
  });
  return row !== null ? rowToDto(row) : null;
}

export interface UpsertProfileData {
  userId: string;
  keycloakUserId: string;
  email: string;
  displayName?: string | null;
  timezone?: string;
  language?: string;
  notificationPrefs?: NotificationPrefs;
  status?: string;
}

export async function upsertProfile(
  db: TenantDbClient,
  data: UpsertProfileData
): Promise<UserProfileDto> {
  const createPayload: TenantPrisma.UserProfileCreateInput = {
    userId: data.userId,
    keycloakUserId: data.keycloakUserId,
    email: data.email,
    displayName: data.displayName ?? null,
    timezone: data.timezone ?? 'UTC',
    language: data.language ?? 'en',
    notificationPrefs: (data.notificationPrefs ?? {}) as unknown as TenantPrisma.InputJsonValue,
    status: data.status ?? 'active',
  };

  const row = await db.userProfile.upsert({
    where: { keycloakUserId: data.keycloakUserId },
    create: createPayload,
    update: {
      displayName: data.displayName ?? null,
      timezone: data.timezone ?? 'UTC',
      language: data.language ?? 'en',
      notificationPrefs: (data.notificationPrefs ?? {}) as unknown as TenantPrisma.InputJsonValue,
      status: data.status ?? 'active',
    },
  });
  return rowToDto(row);
}

export async function updateAvatarPath(
  db: TenantDbClient,
  userId: string,
  avatarPath: string
): Promise<void> {
  await db.userProfile.update({
    where: { userId },
    data: { avatarPath },
  });
}

export interface UpdateProfileFields {
  displayName?: string | null;
  timezone?: string;
  language?: string;
  /**
   * New email — written in the SAME update as the other fields, AFTER Keycloak
   * has confirmed the sync (006-11, Keycloak-first). Never set when the
   * upstream sync rejects — the service layer guarantees the ordering, so the
   * local profile can never diverge. A single Prisma `update` keeps the email
   * and profile-field writes atomic: no crash window between two writes.
   */
  email?: string;
}

export async function updateProfile(
  db: TenantDbClient,
  userId: string,
  fields: UpdateProfileFields
): Promise<UserProfileDto> {
  // Build update payload with only defined fields to avoid overwriting unchanged data
  const data: TenantPrisma.UserProfileUpdateInput = {};
  if ('displayName' in fields) data.displayName = fields.displayName;
  if (fields.timezone !== undefined) data.timezone = fields.timezone;
  if (fields.language !== undefined) data.language = fields.language;
  if (fields.email !== undefined) data.email = fields.email;

  const row = await db.userProfile.update({
    where: { userId },
    data,
  });
  return rowToDto(row);
}
