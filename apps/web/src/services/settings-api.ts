// settings-api.ts
// Typed API functions for tenant settings domain.
// Used by TanStack Query hooks in use-tenant-settings.ts and use-branding.ts.
//
// API_BASE is NOT redefined here — it is imported (indirectly, via apiClient)
// from api-client.ts, the single source of truth. The paths below already carry the
// /api prefix, so API_BASE must not include it.

import { z } from 'zod';
import { invalidResponseError } from '@plexica/auth/api-client';

import { apiClient, fileFormData } from './api-client.js';

import type {
  TenantSettings,
  TenantBranding,
  AuthConfig,
  UpdateTenantSettingsPayload,
  UpdateAuthConfigPayload,
} from '../types/settings.js';

/**
 * SINGLE source of truth for the logo upload constraints on the client.
 *
 * Mirrors the server contract and must be kept in lockstep with it:
 *   - size    → `LOGO_MAX_BYTES` (services/core-api/src/lib/config.ts)
 *   - formats → `LOGO_ALLOWED_MIME_TYPES` (services/core-api/src/lib/file-upload.ts)
 *
 * The `accept` attribute, the `maxSizeBytes` prop and the localized copy are all
 * derived from here — never restated independently.
 */
export const LOGO_UPLOAD = {
  maxBytes: 2_097_152,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
} as const;

// Validated rather than cast: nothing else would catch a contract drift.
const tenantBrandingSchema = z.object({
  id: z.string(),
  primaryColor: z.string(),
  darkMode: z.boolean(),
  logoUrl: z.string().nullable(),
});

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

  // Multipart upload for the logo — goes through the shared api-client so the
  // bearer token, refresh-on-401 and session-expiry behaviour are identical to
  // every other call.
  uploadLogo: async (file: File): Promise<TenantBranding> => {
    const body = await apiClient.patchForm<unknown>('/api/v1/tenant/branding', fileFormData(file));
    const parsed = tenantBrandingSchema.safeParse(body);
    if (!parsed.success) {
      // Non-HTTP status: a malformed 200 body is NOT a success. Machine-readable
      // code — the component renders the localized message.
      throw invalidResponseError();
    }
    return parsed.data;
  },
};
