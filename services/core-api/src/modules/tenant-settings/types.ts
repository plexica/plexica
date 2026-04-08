// types.ts
// Domain types for the tenant-settings module.
// Implements: Spec 003, Phase 9

export interface TenantSettingsDto {
  tenantId: string;
  slug: string; // read-only (DR-07)
  displayName: string;
  createdAt: string;
}

export interface TenantBrandingDto {
  id: string;
  primaryColor: string;
  darkMode: boolean;
  logoUrl: string | null;
}

export interface AuthConfigDto {
  loginTheme: string;
  ssoSessionMaxLifespan: number;
  bruteForceProtected: boolean;
  failureFactor: number;
}

export interface UpdateSettingsInput {
  displayName: string;
}

export interface UpdateBrandingInput {
  primaryColor?: string;
  darkMode?: boolean;
}

export interface UpdateAuthConfigInput {
  loginTheme?: string;
  ssoSessionMaxLifespan?: number;
  bruteForceProtected?: boolean;
  failureFactor?: number;
}
