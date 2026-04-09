// settings-api.ts
// Typed API functions for tenant settings domain.
// Used by TanStack Query hooks in use-tenant-settings.ts and use-branding.ts.

import { useAuthStore } from '../stores/auth-store.js';

import { apiClient } from './api-client.js';

import type {
  TenantSettings,
  TenantBranding,
  AuthConfig,
  UpdateTenantSettingsPayload,
  UpdateAuthConfigPayload,
} from '../types/settings.js';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const settingsApi = {
  // Backend returns objects directly (no { data } wrapper)
  getSettings: () => apiClient.get<TenantSettings>('/api/v1/tenant/settings'),

  updateSettings: (payload: UpdateTenantSettingsPayload) =>
    apiClient.patch<TenantSettings>('/api/v1/tenant/settings', payload),

  getBranding: () => apiClient.get<TenantBranding>('/api/v1/tenant/branding'),

  updateBranding: (payload: { primaryColor?: string; darkMode?: boolean }) =>
    apiClient.patch<TenantBranding>('/api/v1/tenant/branding', payload),

  getAuthConfig: () => apiClient.get<AuthConfig>('/api/v1/tenant/auth-config'),

  updateAuthConfig: (payload: UpdateAuthConfigPayload) =>
    apiClient.patch<AuthConfig>('/api/v1/tenant/auth-config', payload),

  // Multipart upload for logo — uses native fetch to avoid apiClient's application/json header
  // Backend returns TenantBranding directly (no { data } wrapper)
  uploadLogo: async (file: File): Promise<TenantBranding> => {
    const { accessToken, tenantSlug } = useAuthStore.getState();
    const headers: Record<string, string> = {};
    if (accessToken !== null) headers['Authorization'] = `Bearer ${accessToken}`;
    if (tenantSlug !== null) headers['X-Tenant-Slug'] = tenantSlug;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/v1/tenant/branding`, {
      method: 'PATCH',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err.error?.message ?? `Upload failed: ${res.status}`);
    }
    return res.json() as Promise<TenantBranding>;
  },
};
