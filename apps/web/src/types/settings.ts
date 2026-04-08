// settings.ts — TypeScript types for tenant settings domain.
// Pure type definitions — no runtime logic.

export interface TenantSettings {
  tenantId: string;
  slug: string;
  displayName: string;
  createdAt: string;
}

export interface TenantBranding {
  id: string;
  primaryColor: string;
  darkMode: boolean;
  logoUrl: string | null;
}

export interface IdpConfig {
  alias: string;
  displayName: string;
  providerId: string;
}

export interface AuthConfig {
  mfaRequired?: boolean;
  sessionMaxSecs?: number;
  idps?: IdpConfig[];
  [key: string]: unknown;
}

export interface UpdateTenantSettingsPayload {
  displayName?: string;
}

export interface UpdateBrandingPayload {
  primaryColor?: string;
  darkMode?: boolean;
}

export interface UpdateAuthConfigPayload {
  mfaRequired?: boolean;
  sessionMaxSecs?: number;
}
