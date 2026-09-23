// profile.ts — TypeScript types for user profile domain.
// Pure type definitions — no runtime logic.
// Session shapes are re-exported from the shared @plexica/api-types contract
// (ADR-029), mirroring types/notification.ts.

export type { UserSession, SessionList } from '@plexica/api-types';

/** Active avatar source (006-12): the Keycloak JWT `picture` claim wins. */
export type AvatarSource = 'keycloak' | 'upload';

export interface UserProfileDto {
  userId: string;
  keycloakUserId: string;
  email: string;
  displayName: string | null;
  avatarPath: string | null;
  timezone: string;
  language: string;
  // Read-only passthrough owned by the notification module (006-04) — the
  // user-profile module never writes this column, so the type stays loose.
  notificationPrefs: Record<string, unknown>;
  avatarUrl: string | null;
  avatarSource: AvatarSource;
  /** Per-realm Keycloak account console URL (006-14). */
  keycloakAccountUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfilePayload {
  displayName?: string;
  email?: string;
  timezone?: string;
  language?: string;
}
