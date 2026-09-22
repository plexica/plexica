// notifications-api.ts
// Typed API functions for the notification domain (features 006-02/04/05).
// Used by TanStack Query hooks in use-notifications.ts and
// use-notification-prefs.ts. API_BASE is imported from api-client.ts — the
// single source of truth.

import { apiClient } from './api-client.js';

import type {
  NotificationDto,
  NotificationListResponse,
  NotificationPreferences,
  NotificationPreferencesPatch,
  NotificationTypeDefinition,
} from '../types/notification.js';

export interface ReadAllResponse {
  updated: number;
}

export const notificationsApi = {
  list: (page = 1, pageSize = 20, filter: 'unread' | 'all' = 'all') =>
    apiClient.get<NotificationListResponse>(
      `/api/v1/notifications?page=${String(page)}&pageSize=${String(pageSize)}&filter=${filter}`
    ),

  markRead: (id: string) =>
    apiClient.patch<NotificationDto>(`/api/v1/notifications/${id}/read`, {}),

  markAllRead: () => apiClient.post<ReadAllResponse>('/api/v1/notifications/read-all', {}),

  getPreferences: () => apiClient.get<NotificationPreferences>('/api/v1/notifications/preferences'),

  updatePreferences: (patch: NotificationPreferencesPatch) =>
    apiClient.patch<NotificationPreferences>('/api/v1/notifications/preferences', patch),

  getTypes: () =>
    apiClient.get<{ types: NotificationTypeDefinition[] }>('/api/v1/notifications/types'),
};
