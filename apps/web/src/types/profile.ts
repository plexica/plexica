// profile.ts — TypeScript types for user profile domain.
// Pure type definitions — no runtime logic.

export interface UserProfileDto {
  userId: string;
  keycloakId: string;
  email: string;
  displayName: string | null;
  timezone: string;
  language: string;
  notificationPrefs: Record<string, boolean>;
  avatarUrl: string | null;
  status: string;
}

export interface UpdateProfilePayload {
  displayName?: string;
  timezone?: string;
  language?: string;
  notificationPrefs?: Record<string, boolean>;
}
