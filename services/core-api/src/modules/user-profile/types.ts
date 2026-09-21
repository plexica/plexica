// types.ts
// Domain types for the user-profile module.

/**
 * notification_prefs JSONB column, passed through read-only. The notification
 * module is the authoritative writer of this column (D-6 nested shape
 * `{ defaults:{inApp,email}, types:{ "<type>":{inApp,email} } }`, feature
 * 006-04); the user-profile module never writes it. Typed loosely because the
 * canonical shape lives in the notification module's PreferenceMap — importing
 * it here would couple two modules for a read-only passthrough.
 */
export type NotificationPrefs = Record<string, unknown>;

export interface UserProfileDto {
  userId: string;
  keycloakUserId: string;
  email: string;
  displayName: string | null;
  avatarPath: string | null;
  /** Presigned object-storage read URL — generated at service layer, not stored in DB. */
  avatarUrl: string | null;
  timezone: string;
  language: string;
  notificationPrefs: NotificationPrefs;
  status: 'active' | 'invited' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileInput {
  displayName?: string | null;
  timezone?: string;
  language?: string;
  // notificationPrefs is read-only here (the raw column is passed through).
  // Writes belong to the notification module's PATCH /notifications/preferences
  // (feature 006-04).
}
