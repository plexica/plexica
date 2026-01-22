// File: apps/web/src/lib/config.ts

/**
 * MEDIUM FIX #10: Environment variable validation
 * Validates all required environment variables at startup
 * Provides type-safe access to configuration
 */

interface Config {
  api: {
    url: string;
  };
  keycloak: {
    url: string;
    clientId: string;
  };
  tenant: {
    defaultTenant: string;
    baseDomain: string;
    overrideRealm?: string;
  };
  isDevelopment: boolean;
  isProduction: boolean;
}

/**
 * Validate and parse environment variables
 * Throws error if required variables are missing
 */
function validateConfig(): Config {
  const errors: string[] = [];

  // API URL validation
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) {
    errors.push('VITE_API_URL is required');
  } else if (!isValidUrl(apiUrl)) {
    errors.push(`VITE_API_URL must be a valid URL: ${apiUrl}`);
  }

  // Keycloak URL validation
  const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL;
  if (!keycloakUrl) {
    errors.push('VITE_KEYCLOAK_URL is required');
  } else if (!isValidUrl(keycloakUrl)) {
    errors.push(`VITE_KEYCLOAK_URL must be a valid URL: ${keycloakUrl}`);
  }

  // Keycloak Client ID validation
  const keycloakClientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID;
  if (!keycloakClientId) {
    errors.push('VITE_KEYCLOAK_CLIENT_ID is required');
  } else if (keycloakClientId.length < 3) {
    errors.push('VITE_KEYCLOAK_CLIENT_ID must be at least 3 characters');
  }

  // Default tenant validation
  const defaultTenant = import.meta.env.VITE_DEFAULT_TENANT;
  if (!defaultTenant) {
    errors.push('VITE_DEFAULT_TENANT is required');
  } else if (!isValidTenantSlug(defaultTenant)) {
    errors.push(
      `VITE_DEFAULT_TENANT must be lowercase alphanumeric with hyphens: ${defaultTenant}`
    );
  }

  // Base domain validation
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN;
  if (!baseDomain) {
    errors.push('VITE_BASE_DOMAIN is required');
  } else if (!isValidDomain(baseDomain)) {
    errors.push(`VITE_BASE_DOMAIN must be a valid domain: ${baseDomain}`);
  }

  // If there are validation errors, throw them
  if (errors.length > 0) {
    const errorMessage = 'Environment configuration is invalid:\n  - ' + errors.join('\n  - ');
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  const isDev = import.meta.env.DEV;
  const isProd = import.meta.env.PROD;

  return {
    api: {
      url: apiUrl,
    },
    keycloak: {
      url: keycloakUrl,
      clientId: keycloakClientId,
    },
    tenant: {
      defaultTenant,
      baseDomain,
      overrideRealm: import.meta.env.VITE_KEYCLOAK_REALM,
    },
    isDevelopment: isDev,
    isProduction: isProd,
  };
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate domain format
 */
function isValidDomain(domain: string): boolean {
  // Match: example.com or sub.example.com
  const domainRegex =
    /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
  return domainRegex.test(domain);
}

/**
 * Validate tenant slug format (lowercase alphanumeric with hyphens)
 */
function isValidTenantSlug(slug: string): boolean {
  const slugRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
  return slugRegex.test(slug);
}

// MEDIUM FIX #10: Validate config on module load
let config: Config;

try {
  config = validateConfig();
  console.log('[Config] Environment configuration validated successfully');
} catch (error) {
  // In production, this prevents app startup
  // In development, show error but allow app to start with warnings
  if (import.meta.env.PROD) {
    throw error;
  }
  console.error('Configuration validation failed:', error);
  // Provide sensible defaults for development
  config = {
    api: {
      url: 'http://localhost:3000',
    },
    keycloak: {
      url: 'http://localhost:8080',
      clientId: 'plexica-web',
    },
    tenant: {
      defaultTenant: 'default',
      baseDomain: 'localhost',
    },
    isDevelopment: true,
    isProduction: false,
  };
  console.warn('[Config] Using fallback configuration for development');
}

/**
 * Get validated configuration
 */
export function getConfig(): Config {
  return { ...config };
}

/**
 * Type-safe access to API URL
 */
export function getApiUrl(): string {
  return config.api.url;
}

/**
 * Type-safe access to Keycloak configuration
 */
export function getKeycloakConfig(): Config['keycloak'] {
  return { ...config.keycloak };
}

/**
 * Type-safe access to tenant configuration
 */
export function getTenantConfig(): Config['tenant'] {
  return { ...config.tenant };
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return config.isProduction;
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return config.isDevelopment;
}
