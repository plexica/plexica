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

export interface AuthConfig {
  loginTheme: string;
  ssoSessionMaxLifespan: number;
  bruteForceProtected: boolean;
  failureFactor: number;
}

export interface UpdateTenantSettingsPayload {
  displayName?: string;
}

export interface UpdateBrandingPayload {
  primaryColor?: string;
  darkMode?: boolean;
}

export interface UpdateAuthConfigPayload {
  loginTheme?: string;
  ssoSessionMaxLifespan?: number;
  bruteForceProtected?: boolean;
  failureFactor?: number;
}
