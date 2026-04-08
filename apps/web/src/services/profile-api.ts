// profile-api.ts
// Typed API functions for user profile domain.
// Used by TanStack Query hooks in use-profile.ts.

import { useAuthStore } from '../stores/auth-store.js';

import { apiClient } from './api-client.js';

import type { UserProfileDto, UpdateProfilePayload } from '../types/profile.js';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const profileApi = {
  get: () => apiClient.get<{ data: UserProfileDto }>('/api/v1/profile'),

  update: (payload: UpdateProfilePayload) =>
    apiClient.patch<{ data: UserProfileDto }>('/api/v1/profile', payload),

  // Multipart upload — uses native fetch to avoid apiClient's application/json header
  uploadAvatar: async (file: File): Promise<{ data: UserProfileDto }> => {
    const { accessToken, tenantSlug } = useAuthStore.getState();
    const headers: Record<string, string> = {};
    if (accessToken !== null) headers['Authorization'] = `Bearer ${accessToken}`;
    if (tenantSlug !== null) headers['X-Tenant-Slug'] = tenantSlug;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/v1/profile/avatar`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err.error?.message ?? `Upload failed: ${res.status}`);
    }
    return res.json() as Promise<{ data: UserProfileDto }>;
  },
};
