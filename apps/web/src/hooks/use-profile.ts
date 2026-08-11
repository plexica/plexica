// use-profile.ts
// TanStack Query hooks for the current user's profile.
// Logic here — components only call these hooks, never API functions directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { profileApi } from '../services/profile-api.js';

import type { UpdateProfilePayload } from '../types/profile.js';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.get(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => profileApi.update(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/**
 * Avatar upload.
 *
 * Failures are NOT swallowed here: the mutation's `isError` / `error` pair is the
 * contract, and `ProfilePage` is required to render a localized message from
 * `ApiError.code` (see i18n/upload-messages.ts) and to drop the optimistic local
 * preview. A silent `onError` here is what made every 413/415/429/5xx invisible.
 *
 * The cache is invalidated on success only — a failed upload must not replace the
 * currently stored avatar URL.
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => profileApi.uploadAvatar(file),
    // Uploads are not idempotent from the user's point of view: never auto-retry.
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
