// service.ts
// Notification orchestration (features 006-01/02/04): dedupe-first create with
// in-app push, center list, ownership-safe mark-read, and preferences. The
// consumer uses the granular pieces (insertNotification + resolveChannels +
// deliverInApp) so the cap check can run between insert and delivery.

import { NotFoundError } from '../../lib/app-error.js';

import { connectionManager } from './connection-manager.js';
import {
  insertNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  readPreferences,
  rowToNotificationDto,
  writePreferences,
} from './repository.js';

import type { TenantDbClient } from '../../lib/tenant-database.js';
import type { PaginatedResult } from '../../lib/pagination.js';
import type {
  CreateNotificationInput,
  NotificationChannel,
  NotificationDto,
  NotificationListQuery,
  PreferenceMap,
} from './types.js';

/** Channel decision from prefs: per-type override wins, else defaults (D-6). */
export function resolveChannels(prefs: PreferenceMap, type: string): NotificationChannel {
  return prefs.types[type] ?? prefs.defaults;
}

/**
 * Dedupe-first create (F6): the insert-ignore is the first DB operation, so a
 * duplicate `event_id` returns null and never publishes. When the in-app
 * channel is enabled the DTO is SSE-pushed to the user's connections.
 */
export async function createNotification(
  db: TenantDbClient,
  input: CreateNotificationInput,
  channels: NotificationChannel,
  tenantSlug: string
): Promise<NotificationDto | null> {
  const { inserted, row } = await insertNotification(db, input);
  if (!inserted || row === null) return null;
  const dto = rowToNotificationDto(row);
  if (channels.inApp) connectionManager.publish(tenantSlug, input.userId, dto);
  return dto;
}

/** SSE-push an already-persisted notification (used by the consumer, step 4). */
export function deliverInApp(tenantSlug: string, userId: string, dto: NotificationDto): boolean {
  return connectionManager.publish(tenantSlug, userId, dto);
}

export async function listNotificationCenter(
  db: TenantDbClient,
  userId: string,
  query: NotificationListQuery
): Promise<PaginatedResult<NotificationDto>> {
  return listNotifications(db, userId, query);
}

/** 404 for not-found OR not-owned — no enumeration (F4 pattern). */
export async function markRead(
  db: TenantDbClient,
  notificationId: string,
  userId: string
): Promise<NotificationDto> {
  const dto = await markNotificationRead(db, notificationId, userId);
  if (dto === null) throw new NotFoundError('Notification not found');
  return dto;
}

export async function markAllRead(
  db: TenantDbClient,
  userId: string
): Promise<{ updated: number }> {
  const updated = await markAllNotificationsRead(db, userId);
  return { updated };
}

export async function getPreferences(db: TenantDbClient, userId: string): Promise<PreferenceMap> {
  return readPreferences(db, userId);
}

/** Merges the partial patch over the normalized current prefs and persists. */
export async function updatePreferences(
  db: TenantDbClient,
  userId: string,
  patch: { defaults?: NotificationChannel; types?: Record<string, NotificationChannel> }
): Promise<PreferenceMap> {
  const current = await readPreferences(db, userId);
  const next: PreferenceMap = {
    defaults: patch.defaults ?? current.defaults,
    types: { ...current.types, ...(patch.types ?? {}) },
  };
  return writePreferences(db, userId, next);
}
