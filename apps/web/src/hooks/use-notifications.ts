// use-notifications.ts
// TanStack Query hooks for the notification center + bell (006-02). Two
// independent refresh paths feed one query key: a 30s poll (refetchInterval)
// and SSE-push invalidation via the in-memory bus (useSseNotificationInvalidation).

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notificationsApi } from '../services/notifications-api.js';
import { notificationEventBus } from '../services/sse-client.js';

export const NOTIFICATIONS_KEY = 'notifications';

export function useNotifications(
  page = 1,
  pageSize = 20,
  filter: 'unread' | 'all' = 'all'
) {
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, { page, pageSize, filter }],
    queryFn: () => notificationsApi.list(page, pageSize, filter),
    // Fallback refresh when SSE is unavailable (e.g. connection closed).
    refetchInterval: 30_000,
  });
}

/** Unread badge count for the header bell (0 when no unread notifications). */
export function useUnreadCount() {
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, 'unread-count'],
    queryFn: async () => (await notificationsApi.list(1, 1, 'unread')).total,
    refetchInterval: 30_000,
  });
}

/**
 * Subscribes to the SSE in-memory bus and invalidates the notification queries
 * on every pushed frame — the real-time refresh path (delivery < 2s NFR).
 * Must be mounted inside the QueryClientProvider (used by bell + center page).
 */
export function useSseNotificationInvalidation(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    return notificationEventBus.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
    });
  }, [queryClient]);
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
    },
  });
}