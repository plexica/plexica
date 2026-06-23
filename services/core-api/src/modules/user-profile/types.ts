// types.ts
// Domain types for the user-profile module.

export interface NotificationPrefs {
  invite_received?: { email: boolean };
  workspace_changes?: { email: boolean };
  role_changes?: { email: boolean };
}

export interface UserProfileDto {
  userId: string;
  keycloakUserId: string;
  email: string;
  displayName: string | null;
  avatarPath: string | null;
  /** Presigned MinIO read URL — generated at service layer, not stored in DB. */
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
  notificationPrefs?: NotificationPrefs;
}
