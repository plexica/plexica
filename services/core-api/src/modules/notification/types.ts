// types.ts
// Notification module domain types (features 006-01…006-05, ADR-035).
// NotificationDto re-exports the shared @plexica/api-types contract (ADR-029);
// the response schema is the single contract for web + tests.

import type { NotificationDto } from '@plexica/api-types';

export type { NotificationDto };

export interface NotificationChannel {
  inApp: boolean;
  email: boolean;
}

/** Nested preference shape (plan D-6). Legacy flat-boolean maps are normalized. */
export interface PreferenceMap {
  defaults: NotificationChannel;
  types: Record<string, NotificationChannel>;
}

/** Legacy `{ "<type>": boolean }` shape stored before the D-6 upgrade. */
export type LegacyPreferences = Record<string, boolean>;

/** Input for inserting one in-app notification row (consumer pipeline). */
export interface CreateNotificationInput {
  /** Consumer idempotency key (unique `notifications.event_id`). */
  eventId: string;
  userId: string;
  type: string;
  titleKey: string;
  bodyKey?: string | null;
  metadata?: Record<string, unknown>;
  /** Optional explicit row id (plugin emission generates it). */
  notificationId?: string;
}

/** Raw row shape returned by the insert-ignore query. */
export interface NotificationRow {
  id: string;
  eventId: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  metadata: unknown;
  read: boolean;
  createdAt: Date;
}

export type NotificationFilter = 'unread' | 'all';

export interface NotificationListQuery {
  page: number;
  pageSize: number;
  filter: NotificationFilter;
}

/** Body accepted by POST /api/v1/notifications/emit (feature 006-05). */
export interface EmitNotificationInput {
  userId: string;
  type: string;
  titleKey: string;
  titleParams?: Record<string, string>;
  bodyKey?: string | null;
  metadata?: Record<string, unknown>;
  timestamp: string;
  correlationId: string;
}

/** Row shape of core.email_queue (feature 006-03). */
export interface EmailQueueRow {
  id: string;
  tenantId: string | null;
  toAddress: string;
  subject: string;
  htmlBody: string;
  emailType: string;
  status: string;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
  /** Delivery marker — set the moment a send is confirmed (CodeRabbit #10). */
  deliveredAt: Date | null;
  /** Lease claim timestamp — set when a worker claims the row (ADR-035). */
  claimedAt: Date | null;
  /** Lease expiry — a `sending` row past this is re-claimable after a crash. */
  leaseExpiresAt: Date | null;
  /** Fencing claim token — required on every settle/retry (ADR-035). */
  leaseToken: string;
  /** Consumer idempotency key (event_id) — ON CONFLICT DO NOTHING on enqueue. */
  dedupeKey: string | null;
}

export const DEFAULT_PREFERENCES: PreferenceMap = {
  defaults: { inApp: true, email: false },
  types: {},
};

/**
 * Legacy pre-D-6 category shape written by the user-profile module
 * (invite_received/workspace_changes/role_changes, each `{ email }`). This
 * notification module is now the authoritative owner of `notification_prefs`;
 * the reader still normalizes any historical category-shaped rows. Categories
 * map to the concrete notification types they control (ADR-035 registry);
 * categories without a consumer type yet are normalized as no-ops so the
 * email intent is never silently dropped on a future type registration.
 */
const CATEGORY_TO_TYPES: Record<string, string[]> = {
  invite_received: ['workspace.invite'],
  workspace_changes: ['workspace.created'],
  role_changes: ['workspace.role_changed'],
};

function isLegacyCategory(raw: Record<string, unknown>): boolean {
  return (
    raw.defaults === undefined &&
    raw.types === undefined &&
    Object.entries(raw).some(
      ([key, value]) =>
        CATEGORY_TO_TYPES[key] !== undefined &&
        typeof value === 'object' &&
        value !== null &&
        'email' in (value as Record<string, unknown>)
    )
  );
}

function isLegacyFlat(raw: Record<string, unknown>): boolean {
  return (
    raw.defaults === undefined &&
    raw.types === undefined &&
    Object.values(raw).every((value) => typeof value === 'boolean')
  );
}

function normalizeChannel(value: unknown, fallback: NotificationChannel): NotificationChannel {
  if (typeof value !== 'object' || value === null) return fallback;
  const record = value as Record<string, unknown>;
  return {
    inApp: typeof record.inApp === 'boolean' ? record.inApp : fallback.inApp,
    email: typeof record.email === 'boolean' ? record.email : fallback.email,
  };
}

/**
 * Normalizes the stored `notification_prefs` JSONB into the nested PreferenceMap
 * (plan D-6). Accepts the legacy flat-boolean shape (`true` → in-app only,
 * matching plan §4.2), the legacy category shape (user-profile module), and the
 * current nested shape; empty/missing → defaults.
 */
export function normalizePreferences(raw: unknown): PreferenceMap {
  if (typeof raw !== 'object' || raw === null) {
    return { defaults: { ...DEFAULT_PREFERENCES.defaults }, types: {} };
  }
  const record = raw as Record<string, unknown>;
  if (isLegacyCategory(record)) {
    const types: PreferenceMap['types'] = {};
    for (const [category, value] of Object.entries(record)) {
      const concrete = CATEGORY_TO_TYPES[category];
      if (concrete === undefined) continue;
      const email = (value as Record<string, unknown>)?.email === true;
      for (const type of concrete) types[type] = { inApp: true, email };
    }
    return { defaults: { ...DEFAULT_PREFERENCES.defaults }, types };
  }
  if (isLegacyFlat(record)) {
    const types: PreferenceMap['types'] = {};
    for (const [type, enabled] of Object.entries(record)) {
      types[type] = { inApp: enabled === true, email: false };
    }
    return { defaults: { ...DEFAULT_PREFERENCES.defaults }, types };
  }
  const defaults = normalizeChannel(record.defaults, DEFAULT_PREFERENCES.defaults);
  const types: PreferenceMap['types'] = {};
  if (typeof record.types === 'object' && record.types !== null) {
    for (const [type, channel] of Object.entries(record.types as Record<string, unknown>)) {
      types[type] = normalizeChannel(channel, defaults);
    }
  }
  return { defaults, types };
}
