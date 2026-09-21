// notification-prefs.ts
// Pure helpers for the notification prefs page (006-04). The dirty check is
// extracted here so the "save button enabled only when the draft differs from
// the persisted prefs" rule is unit-testable (review B2) without rendering the
// component. Field-order-independent comparison via JSON.stringify on the two
// canonical shapes (defaults + types), matching what PATCH persists.

import type { NotificationChannel, NotificationPreferences } from '../types/notification.js';

/** Current on-screen draft (defaults + per-type overrides). */
export interface PrefsDraft {
  defaults: NotificationChannel;
  types: Record<string, NotificationChannel>;
}

/** True when the draft differs from the persisted prefs (button enabled). */
export function prefsHaveChanges(draft: PrefsDraft, loaded: NotificationPreferences): boolean {
  return JSON.stringify(canonicalize(draft)) !== JSON.stringify(canonicalize(loaded));
}

function normalizeChannel(channel: NotificationChannel): NotificationChannel {
  return { inApp: channel.inApp, email: channel.email };
}

function canonicalize(prefs: PrefsDraft | NotificationPreferences): {
  defaults: NotificationChannel;
  types: Array<readonly [string, NotificationChannel]>;
} {
  const types = Object.keys(prefs.types)
    .sort()
    .flatMap((key) => {
      const channel = prefs.types[key];
      return channel === undefined ? [] : ([[key, normalizeChannel(channel)]] as const);
    });
  return { defaults: normalizeChannel(prefs.defaults), types };
}
