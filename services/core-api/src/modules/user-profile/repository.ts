// repository.ts
// Tenant-schema data access layer for the user_profile table.
// All functions accept a type-erased Prisma transaction client (unknown → any cast)
// because the tenant-schema Prisma client is generated separately.

import type { NotificationPrefs, UserProfileDto } from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToDto(row: Record<string, unknown>): UserProfileDto {
  return {
    userId: String(row['userId']),
    keycloakUserId: String(row['keycloakUserId']),
    email: String(row['email']),
    displayName: row['displayName'] != null ? String(row['displayName']) : null,
    avatarPath: row['avatarPath'] != null ? String(row['avatarPath']) : null,
    avatarUrl: null, // Populated by service layer via getPresignedReadUrl()
    timezone: String(row['timezone']),
    language: String(row['language']),
    notificationPrefs: (row['notificationPrefs'] as NotificationPrefs) ?? {},
    status: row['status'] as UserProfileDto['status'],
    createdAt: (row['createdAt'] as Date).toISOString(),
    updatedAt: (row['updatedAt'] as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public repository functions
// ---------------------------------------------------------------------------

export async function findProfileByUserId(
  db: unknown,
  userId: string
): Promise<UserProfileDto | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).userProfile.findUnique({
    where: { userId },
  });
  return row !== null ? rowToDto(row as Record<string, unknown>) : null;
}

export async function findProfileByKeycloakId(
  db: unknown,
  keycloakUserId: string
): Promise<UserProfileDto | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).userProfile.findUnique({
    where: { keycloakUserId },
  });
  return row !== null ? rowToDto(row as Record<string, unknown>) : null;
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

export async function upsertProfile(db: unknown, data: UpsertProfileData): Promise<UserProfileDto> {
  const createPayload = {
    userId: data.userId,
    keycloakUserId: data.keycloakUserId,
    email: data.email,
    displayName: data.displayName ?? null,
    timezone: data.timezone ?? 'UTC',
    language: data.language ?? 'en',
    notificationPrefs: data.notificationPrefs ?? {},
    status: data.status ?? 'active',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).userProfile.upsert({
    where: { keycloakUserId: data.keycloakUserId },
    create: createPayload,
    update: {
      displayName: data.displayName ?? null,
      timezone: data.timezone ?? 'UTC',
      language: data.language ?? 'en',
      notificationPrefs: data.notificationPrefs ?? {},
      status: data.status ?? 'active',
    },
  });
  return rowToDto(row as Record<string, unknown>);
}

export async function updateAvatarPath(
  db: unknown,
  userId: string,
  avatarPath: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).userProfile.update({
    where: { userId },
    data: { avatarPath },
  });
}

export interface UpdateProfileFields {
  displayName?: string | null;
  timezone?: string;
  language?: string;
  notificationPrefs?: NotificationPrefs;
}

export async function updateProfile(
  db: unknown,
  userId: string,
  fields: UpdateProfileFields
): Promise<UserProfileDto> {
  // Build update payload with only defined fields to avoid overwriting unchanged data
  const data: Record<string, unknown> = {};
  if ('displayName' in fields) data['displayName'] = fields.displayName;
  if (fields.timezone !== undefined) data['timezone'] = fields.timezone;
  if (fields.language !== undefined) data['language'] = fields.language;
  if (fields.notificationPrefs !== undefined) data['notificationPrefs'] = fields.notificationPrefs;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).userProfile.update({
    where: { userId },
    data,
  });
  return rowToDto(row as Record<string, unknown>);
}
