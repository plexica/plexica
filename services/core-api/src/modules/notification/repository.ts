// repository.ts
// Data access for the tenant-scoped notifications table and notification prefs
// on user_profile (features 006-02/006-04). The insert uses insert-ignore
// semantics — `ON CONFLICT (event_id) DO NOTHING` — for consumer idempotency
// (F6, plan §5.2): the UNIQUE index on event_id makes redelivery a no-op.

import { Prisma } from '../../../prisma/generated/tenant-client/index.js';
import { buildPaginatedResult, buildPaginationClause } from '../../lib/pagination.js';

import { normalizePreferences } from './types.js';

import type { TenantDbClient, TenantPrisma } from '../../lib/tenant-database.js';
import type { PaginatedResult } from '../../lib/pagination.js';
import type {
  CreateNotificationInput,
  NotificationDto,
  NotificationListQuery,
  NotificationRow,
  PreferenceMap,
} from './types.js';

type NotificationPayload = TenantPrisma.NotificationGetPayload<{}>;

function rowToDto(row: NotificationPayload): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    titleKey: row.title,
    bodyKey: row.body,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

/** DTO builder for the raw insert-ignore row (consumer pipeline, step 4). */
export function rowToNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    titleKey: row.title,
    bodyKey: row.body,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listNotifications(
  db: TenantDbClient,
  userId: string,
  query: NotificationListQuery
): Promise<PaginatedResult<NotificationDto>> {
  const where: TenantPrisma.NotificationWhereInput = { userId };
  if (query.filter === 'unread') where.read = false;
  const { skip, take } = buildPaginationClause({ page: query.page, pageSize: query.pageSize });
  const [rows, total] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    db.notification.count({ where }),
  ]);
  return buildPaginatedResult(rows.map(rowToDto), total, {
    page: query.page,
    pageSize: query.pageSize,
  });
}

/** Returns the DTO only when the row exists AND belongs to `userId` (no enumeration). */
export async function markNotificationRead(
  db: TenantDbClient,
  notificationId: string,
  userId: string
): Promise<NotificationDto | null> {
  const result = await db.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });
  if (result.count === 0) return null;
  const row = await db.notification.findUnique({ where: { id: notificationId } });
  return row ? rowToDto(row) : null;
}

export async function markAllNotificationsRead(
  db: TenantDbClient,
  userId: string
): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
  return result.count;
}

export interface InsertNotificationResult {
  inserted: boolean;
  row: NotificationRow | null;
}

/**
 * Insert-ignore (F6): `ON CONFLICT DO NOTHING` (no target) makes the insert the
 * atomic dedupe gate — an at-least-once redelivery (ADR-004) returns
 * `inserted: false` and consumes no quota downstream. Covers BOTH unique
 * constraints: a duplicate `event_id` (redelivery) AND a reused `notificationId`
 * row id (M1 — a producer bug would otherwise surface a PK violation → DLQ).
 * The row id is the explicit `notificationId` (plugin emission) or a fresh UUID.
 */
export async function insertNotification(
  db: TenantDbClient,
  input: CreateNotificationInput
): Promise<InsertNotificationResult> {
  const notificationId = input.notificationId ?? crypto.randomUUID();
  const count = await db.$executeRaw(Prisma.sql`
    INSERT INTO notifications (id, event_id, user_id, type, title, body, metadata)
    VALUES (
      ${notificationId}::uuid, ${input.eventId}, ${input.userId}::uuid,
      ${input.type}, ${input.titleKey}, ${input.bodyKey ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    ON CONFLICT DO NOTHING
  `);
  if (count === 0) return { inserted: false, row: null };
  const rows = await db.$queryRaw<NotificationRow[]>(Prisma.sql`
    SELECT id, event_id AS "eventId", user_id AS "userId", type, title, body,
      metadata, read, created_at AS "createdAt"
    FROM notifications
    WHERE event_id = ${input.eventId}
  `);
  return { inserted: true, row: rows[0] ?? null };
}

export async function readPreferences(db: TenantDbClient, userId: string): Promise<PreferenceMap> {
  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: { notificationPrefs: true },
  });
  return normalizePreferences(profile?.notificationPrefs);
}

export async function writePreferences(
  db: TenantDbClient,
  userId: string,
  prefs: PreferenceMap
): Promise<PreferenceMap> {
  await db.userProfile.update({
    where: { userId },
    data: { notificationPrefs: prefs as unknown as TenantPrisma.InputJsonValue },
  });
  return prefs;
}

export async function findProfileByEmail(
  db: TenantDbClient,
  email: string
): Promise<{ userId: string } | null> {
  return db.userProfile.findFirst({
    where: { email },
    select: { userId: true },
  });
}

export interface ConsumerProfile {
  userId: string;
  email: string;
  notificationPrefs: unknown;
}

export async function findConsumerProfile(
  db: TenantDbClient,
  userId: string
): Promise<ConsumerProfile | null> {
  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: { userId: true, email: true, notificationPrefs: true },
  });
  if (profile === null) return null;
  return profile;
}
