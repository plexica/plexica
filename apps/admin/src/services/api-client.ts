// api-client.ts
// Admin app API client — configured fetch wrapper with automatic
// Authorization bearer token injection and 401-driven token refresh.
// NO X-Tenant-Slug header — admin routes bypass tenant context (master realm).
//
// Uses the shared @plexica/auth/api-client factory.

import { createApiClient, ApiError } from '@plexica/auth/api-client';

export { ApiError };

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
  // Admin app: no X-Tenant-Slug header — admin endpoints operate cross-tenant.
});
