// use-notification-prefs.ts
// TanStack Query hooks for per-type notification preferences (006-04).
// The prefs page renders one channel-toggle row per registered type and saves
// the partial nested patch through a mutation (react-query only, Rule 3).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notificationsApi } from '../services/notifications-api.js';

import type { NotificationPreferencesPatch } from '../types/notification.js';

export const NOTIFICATION_PREFS_KEY = 'notification-prefs';

export function useNotificationPreferences() {
  return useQuery({
    queryKey: [NOTIFICATION_PREFS_KEY],
    queryFn: () => notificationsApi.getPreferences(),
  });
}

/** Registered notification types (core + installed plugin-declared). */
export function useNotificationTypes() {
  return useQuery({
    queryKey: [NOTIFICATION_PREFS_KEY, 'types'],
    queryFn: () => notificationsApi.getTypes(),
  });
}

export function useSaveNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) =>
      notificationsApi.updatePreferences(patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [NOTIFICATION_PREFS_KEY] });
    },
  });
}