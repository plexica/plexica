// tenant/notification.ts
// Notification domain response schemas (ADR-029 pattern, spec 006).
// Single contract for web + tests: NotificationDto, NotificationList,
// NotificationPreferences, SessionList (features 006-01/02/04/13).

import { z } from 'zod';

// ── NotificationDto (006-01/006-02) ─────────────────────────────────────────

/**
 * A single in-app notification. Titles are i18n keys (no PII, Security §6).
 * `titleKey`/`bodyKey` are resolved by the UI via react-intl; `metadata`
 * carries routing/context data only.
 */
export const NotificationDtoSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  titleKey: z.string().min(1),
  bodyKey: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  read: z.boolean(),
  createdAt: z.string(),
});
export type NotificationDto = z.infer<typeof NotificationDtoSchema>;

// ── NotificationList (006-02) ───────────────────────────────────────────────

export const NotificationListSchema = z.object({
  data: z.array(NotificationDtoSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  totalPages: z.number().int().min(0),
});
export type NotificationList = z.infer<typeof NotificationListSchema>;

// ── NotificationPreferences (006-04) ────────────────────────────────────────

export const NotificationChannelSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
});
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

/**
 * Nested preference shape (plan D-6): `{ defaults, types: { "<type>": {...} } }`.
 * The backend reader normalizes the legacy flat-boolean shape into this one.
 */
export const NotificationPreferencesSchema = z.object({
  defaults: NotificationChannelSchema,
  types: z.record(z.string(), NotificationChannelSchema),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

// ── SessionList (006-13) ────────────────────────────────────────────────────

export const UserSessionSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  ipAddress: z.string().nullable(),
  startedAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean(),
});
export type UserSession = z.infer<typeof UserSessionSchema>;

export const SessionListSchema = z.object({
  sessions: z.array(UserSessionSchema),
});
export type SessionList = z.infer<typeof SessionListSchema>;
