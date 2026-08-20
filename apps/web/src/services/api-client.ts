// api-client.ts
// Tenant web app API client — configured fetch wrapper with automatic
// Authorization bearer token injection, a development-only tenant override,
// and 401-driven token refresh.
//
// Uses the shared @plexica/auth/api-client factory. That factory also handles
// multipart uploads (`postForm` / `patchForm`), so this module deliberately has
// NO upload helper of its own: a second, hand-rolled auth path is exactly what
// let 401s during avatar/logo uploads escape the refresh pipeline.
//
// This module is the SINGLE source of truth for `API_BASE`. Every other service
// module (profile-api, settings-api, tenant-resolver) imports it from here.
// Duplicating the constant is what produced the /api/api/v1/… 404 regression and
// violates Rule 3 of the constitution (one pattern per operation).

import { createApiClient, ApiError } from '@plexica/auth/api-client';

import { useAuthStore } from '../stores/auth-store.js';

export { ApiError };

/**
 * Origin of the core-api backend.
 *
 * It must NOT include the `/api` prefix — every path passed to `apiClient`
 * already carries it (e.g. `/api/v1/profile`, `/api/tenants/resolve`).
 *
 * An empty string means "same origin", which is the deployment shape used in dev
 * (Vite proxy) and in single-origin production deployments. A cross-origin deploy
 * sets `VITE_API_URL=https://api.example.com` and works identically.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

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

/** Builds the single-file multipart body every upload endpoint expects. */
export function fileFormData(file: File): FormData {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}
