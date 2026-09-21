// types/notification.ts — Notification domain types (features 006-01…006-05).
// Re-exports the shared @plexica/api-types contract (ADR-029); app-specific
// response/patch shapes live here.

import type { NotificationList } from '@plexica/api-types';

export type {
  NotificationDto,
  NotificationChannel,
  NotificationList,
  NotificationPreferences,
} from '@plexica/api-types';

/** Paginated center list — the shared contract (ADR-029), incl. totalPages. */
export type NotificationListResponse = NotificationList;

/** One row of the type registry (core + installed plugin-declared types). */
export interface NotificationTypeDefinition {
  key: string;
  labelKey: string;
  channels: Array<'inApp' | 'email'>;
}

/** Partial nested prefs patch for PATCH /notifications/preferences. */
export interface NotificationPreferencesPatch {
  defaults?: import('@plexica/api-types').NotificationChannel;
  types?: Record<string, import('@plexica/api-types').NotificationChannel>;
}
