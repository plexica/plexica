// apps/super-admin/src/lib/keycloak.ts

import Keycloak from 'keycloak-js';
import type { KeycloakConfig, KeycloakInitOptions } from 'keycloak-js';
import { getKeycloakConfig } from './config';

/**
 * Super Admin Keycloak Integration
 *
 * KEY DIFFERENCES from apps/web:
 * - Fixed realm: plexica-admin (not tenant-specific)
 * - No tenant extraction from URL
 * - No workspace-related logic
 * - Platform-level admin authentication
 */

// Keycloak instance (singleton for super-admin)
let keycloakInstance: Keycloak | null = null;
let initializationPromise: Promise<boolean> | null = null;

// Atomic flag to prevent race conditions during initialization
let isInitializing = false;

// Token refresh interval ID for cleanup
let tokenRefreshIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Creates Keycloak configuration for super-admin.
 * Uses fixed realm: plexica-admin
 */
function createKeycloakConfig(): KeycloakConfig {
  const config = getKeycloakConfig();

  console.log(`[Keycloak Super-Admin] Creating config for realm: ${config.realm}`);

  return {
    url: config.url,
    realm: config.realm, // Fixed: plexica-admin
    clientId: config.clientId,
  };
}

const initOptions: KeycloakInitOptions = {
  onLoad: 'check-sso',
  silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
  pkceMethod: 'S256',
  checkLoginIframe: false,
};

/**
 * Initialize Keycloak for super-admin realm
 */
export const initKeycloak = async (): Promise<boolean> => {
  // Use atomic flag to prevent concurrent initialization
  if (isInitializing && initializationPromise) {
    console.log('[Keycloak Super-Admin] Initialization in progress, waiting...');
    return initializationPromise;
  }

  // If already initialized, return the current authentication status
  if (keycloakInstance) {
    console.log('[Keycloak Super-Admin] Already initialized, returning auth status');
    return keycloakInstance.authenticated || false;
  }

  // Set atomic flag BEFORE starting initialization
  isInitializing = true;

  try {
    console.log('[Keycloak Super-Admin] Starting initialization...');
    initializationPromise = (async () => {
      try {
        const keycloakConfig = createKeycloakConfig();
        keycloakInstance = new Keycloak(keycloakConfig);
        const authenticated = await keycloakInstance.init(initOptions);

        // Setup token refresh
        if (authenticated && keycloakInstance.token) {
          // Clear any existing interval first
          if (tokenRefreshIntervalId) {
            clearInterval(tokenRefreshIntervalId);
          }

          // Refresh token every 60 seconds with proper error handling
          tokenRefreshIntervalId = setInterval(async () => {
            try {
              const refreshed = await keycloakInstance!.updateToken(70);
              if (refreshed) {
                console.log('[Keycloak Super-Admin] Token refreshed successfully');
              }
            } catch (error) {
              console.error('[Keycloak Super-Admin] Token refresh failed:', error);

              // Clear auth and redirect to login on refresh failure
              clearAuth();
              window.location.href = '/login';
            }
          }, 60000);
        }

        console.log(
          '[Keycloak Super-Admin] Initialization complete, authenticated:',
          authenticated
        );
        return authenticated;
      } catch (error) {
        console.error('[Keycloak Super-Admin] Failed to initialize:', error);
        throw error;
      }
    })();

    const result = await initializationPromise;
    console.log('[Keycloak Super-Admin] Returning initialization result:', result);
    return result;
  } finally {
    // Always reset the atomic flag after initialization completes
    isInitializing = false;
    initializationPromise = null;
  }
};

/**
 * Redirect to Keycloak login page
 */
export const login = () => {
  if (!keycloakInstance) {
    console.error('[Keycloak Super-Admin] Not initialized, cannot login');
    return;
  }
  keycloakInstance.login();
};

/**
 * Logout from Keycloak
 */
export const logout = () => {
  if (!keycloakInstance) {
    console.error('[Keycloak Super-Admin] Not initialized, cannot logout');
    return;
  }

  // Clear token refresh interval
  if (tokenRefreshIntervalId) {
    clearInterval(tokenRefreshIntervalId);
    tokenRefreshIntervalId = null;
  }

  keycloakInstance.logout();
};

/**
 * Get current access token
 */
export const getToken = (): string | undefined => {
  return keycloakInstance?.token;
};

/**
 * Get parsed token (contains user info and roles)
 */
export const getTokenParsed = () => {
  return keycloakInstance?.tokenParsed;
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return keycloakInstance?.authenticated || false;
};

/**
 * Check if user has a specific role
 * Super-admin typically has 'super-admin' role
 */
export const hasRole = (role: string): boolean => {
  return keycloakInstance?.hasRealmRole(role) || false;
};

/**
 * Check if user has super-admin role
 */
export const isSuperAdmin = (): boolean => {
  return hasRole('super-admin');
};

/**
 * Load user information from Keycloak
 */
export const getUserInfo = () => {
  if (!keycloakInstance) {
    console.error('[Keycloak Super-Admin] Not initialized, cannot get user info');
    return null;
  }
  return keycloakInstance.loadUserInfo();
};

/**
 * Update token if it's about to expire
 * @param minValidity - Minimum validity in seconds (default: 5)
 */
export const updateToken = (minValidity: number = 5) => {
  if (!keycloakInstance) {
    console.error('[Keycloak Super-Admin] Not initialized, cannot update token');
    return Promise.reject(new Error('Keycloak not initialized'));
  }
  return keycloakInstance.updateToken(minValidity);
};

/**
 * Get Keycloak instance (for advanced usage)
 */
export const getKeycloakInstance = (): Keycloak | null => {
  return keycloakInstance;
};

/**
 * Clear authentication state
 * Used when token refresh fails
 */
export const clearAuth = () => {
  if (tokenRefreshIntervalId) {
    clearInterval(tokenRefreshIntervalId);
    tokenRefreshIntervalId = null;
  }
  keycloakInstance = null;
  initializationPromise = null;
  isInitializing = false;
};
