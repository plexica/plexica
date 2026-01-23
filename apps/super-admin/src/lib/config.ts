// File: apps/super-admin/src/lib/config.ts

/**
 * Super Admin Configuration
 * Environment variable validation and type-safe access
 *
 * Key differences from tenant app:
 * - No tenant-specific configuration
 * - Single Keycloak realm: plexica-admin
 * - Platform-wide admin credentials
 */

interface Config {
  api: {
    url: string;
  };
  keycloak: {
    url: string;
    realm: string;
    clientId: string;
  };
  isDevelopment: boolean;
  isProduction: boolean;
}

/**
 * Validate and parse environment variables
 * Throws error if required variables are missing in production
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

  // If there are validation errors, log and throw in production
  if (errors.length > 0) {
    const errorMessage = 'Environment configuration is invalid:\n  - ' + errors.join('\n  - ');
    console.error(errorMessage);

    // In production, prevent app startup
    if (import.meta.env.PROD) {
      throw new Error(errorMessage);
    }
  }

  const isDev = import.meta.env.DEV;
  const isProd = import.meta.env.PROD;

  return {
    api: {
      url: apiUrl || 'http://localhost:3000',
    },
    keycloak: {
      url: keycloakUrl || 'http://localhost:8080',
      realm: 'plexica-admin', // Fixed realm for super-admin (not tenant-specific)
      clientId: keycloakClientId || 'super-admin-app',
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

// Validate config on module load
let config: Config;

try {
  config = validateConfig();
  console.log('[Super Admin Config] Environment configuration validated successfully');
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
      realm: 'plexica-admin',
      clientId: 'super-admin-app',
    },
    isDevelopment: true,
    isProduction: false,
  };
  console.warn('[Super Admin Config] Using fallback configuration for development');
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
