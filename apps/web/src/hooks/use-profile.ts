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

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => profileApi.uploadAvatar(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
