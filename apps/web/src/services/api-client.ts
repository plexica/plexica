// api-client.ts
// Tenant web app API client — configured fetch wrapper with automatic
// Authorization bearer token injection, a development-only tenant override,
// and 401-driven token refresh.
//
// Uses the shared @plexica/auth/api-client factory.

import { createApiClient } from '@plexica/auth/api-client';

import { useAuthStore } from '../stores/auth-store.js';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export const apiClient = createApiClient({
  baseUrl: API_BASE,
  getTokens: () => {
    const state = useAuthStore.getState();
    return {
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
    };
  },
  refreshTokens: async () => {
    await useAuthStore.getState().refresh();
  },
  onSessionExpired: () => {
    useAuthStore.getState().setSessionExpired();
  },
  extraHeaders: () => {
    const state = useAuthStore.getState();
    return {
      ...(import.meta.env.DEV && state.tenantSlug !== null
        ? { 'X-Tenant-Slug': state.tenantSlug }
        : {}),
    };
  },
});
