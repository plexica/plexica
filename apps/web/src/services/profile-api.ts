// profile-api.ts
// Typed API functions for user profile domain.
// Used by TanStack Query hooks in use-profile.ts.
//
// API_BASE is NOT redefined here — it is imported from api-client.ts, the single
// source of truth. The paths below already carry the /api prefix, so API_BASE
// must not include it (empty for same-origin, an absolute origin for cross-origin).

import { z } from 'zod';
import { invalidResponseError } from '@plexica/auth/api-client';

import { apiClient, fileFormData } from './api-client.js';

import type { UserProfileDto, UpdateProfilePayload } from '../types/profile.js';

/**
 * SINGLE source of truth for the avatar upload constraints on the client.
 *
 * These values mirror the server contract and must be kept in lockstep with it:
 *   - size    → `AVATAR_MAX_BYTES` (services/core-api/src/lib/config.ts)
 *   - formats → `AVATAR_ALLOWED_MIME_TYPES` (services/core-api/src/lib/file-upload.ts)
 *
 * Everything user-facing is derived from here — the `accept` attribute, the
 * `maxSizeBytes` prop AND the localized copy — so the three-way drift that let a
 * 1.5 MB PNG through the client only to be rejected with a 413 cannot reappear.
 */
export const AVATAR_UPLOAD = {
  maxBytes: 1_048_576,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/**
 * The avatar endpoint returns only the freshly signed URL — NOT the full profile.
 * Validated instead of cast so a silent contract drift surfaces at runtime rather
 * than hiding behind a green typecheck.
 */
const avatarUploadResponseSchema = z.object({ avatarUrl: z.string() });

export type AvatarUploadResponse = z.infer<typeof avatarUploadResponseSchema>;

export const profileApi = {
  get: () => apiClient.get<UserProfileDto>('/api/v1/profile'),

  update: (payload: UpdateProfilePayload) =>
    apiClient.patch<UserProfileDto>('/api/v1/profile', payload),

  uploadAvatar: async (file: File): Promise<AvatarUploadResponse> => {
    // postForm — same bearer/refresh/session-expiry pipeline as every other call.
    const body = await apiClient.postForm<unknown>('/api/v1/profile/avatar', fileFormData(file));
    const parsed = avatarUploadResponseSchema.safeParse(body);
    if (!parsed.success) {
      // Non-HTTP status: a malformed 200 body is NOT a success. Machine-readable
      // code — the component renders the localized message.
      throw invalidResponseError();
    }
    return parsed.data;
  },
};
