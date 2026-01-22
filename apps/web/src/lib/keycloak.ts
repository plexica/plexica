// apps/web/src/lib/keycloak.ts

import Keycloak from 'keycloak-js';
import type { KeycloakConfig, KeycloakInitOptions } from 'keycloak-js';
import { getTenantFromUrl, getRealmForTenant } from './tenant';

// Keycloak instance is tenant-specific and initialized dynamically
let keycloakInstance: Keycloak | null = null;
let initializationPromise: Promise<boolean> | null = null;
let currentTenantSlug: string | null = null;

// CRITICAL FIX #2: Atomic flag to prevent race conditions during initialization
let isInitializing = false;

/**
 * Gets the current tenant slug from URL.
 * This function is exported to allow other modules to access the tenant.
 */
export const getCurrentTenantSlug = (): string => {
  return getTenantFromUrl();
};

/**
 * Creates a Keycloak configuration for the current tenant.
 * Each tenant has its own realm in Keycloak.
 */
function createKeycloakConfig(): KeycloakConfig {
  const tenantSlug = getTenantFromUrl();
  const realm = getRealmForTenant(tenantSlug);

  console.log(`[Keycloak] Creating config for tenant: ${tenantSlug}, realm: ${realm}`);

  return {
    url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
    realm,
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'plexica-web',
  };
}

const initOptions: KeycloakInitOptions = {
  onLoad: 'check-sso',
  silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
  pkceMethod: 'S256',
  checkLoginIframe: false,
};

export const initKeycloak = async (): Promise<boolean> => {
  const tenantSlug = getTenantFromUrl();

  // If we're switching tenants, clear the current instance
  if (currentTenantSlug && currentTenantSlug !== tenantSlug) {
    console.log(
      `[Keycloak] Tenant changed from ${currentTenantSlug} to ${tenantSlug}, reinitializing...`
    );
    keycloakInstance = null;
    initializationPromise = null;
    isInitializing = false;
  }

  currentTenantSlug = tenantSlug;

  // CRITICAL FIX #2: Use atomic flag to prevent concurrent initialization
  // If initialization is already in progress, wait for it to complete
  if (isInitializing && initializationPromise) {
    console.log('[Keycloak] Initialization in progress, waiting...');
    return initializationPromise;
  }

  // If already initialized, return the current authentication status
  if (keycloakInstance) {
    console.log('[Keycloak] Already initialized, returning auth status');
    return keycloakInstance.authenticated || false;
  }

  // Set atomic flag BEFORE starting initialization to prevent other threads
  isInitializing = true;

  try {
    // Start new initialization
    console.log('[Keycloak] Starting initialization...');
    initializationPromise = (async () => {
      try {
        const keycloakConfig = createKeycloakConfig();
        keycloakInstance = new Keycloak(keycloakConfig);
        const authenticated = await keycloakInstance.init(initOptions);

        // Setup token refresh
        if (authenticated && keycloakInstance.token) {
          // Refresh token every 60 seconds
          setInterval(() => {
            keycloakInstance!
              .updateToken(70)
              .then((refreshed: boolean) => {
                if (refreshed) {
                  console.log('[Keycloak] Token refreshed');
                }
              })
              .catch(() => {
                console.error('[Keycloak] Failed to refresh token');
              });
          }, 60000);
        }

        console.log('[Keycloak] Initialization complete, authenticated:', authenticated);
        return authenticated;
      } catch (error) {
        console.error('[Keycloak] Failed to initialize:', error);
        throw error;
      }
    })();

    const result = await initializationPromise;
    console.log('[Keycloak] Returning initialization result:', result);
    return result;
  } finally {
    // Always reset the atomic flag after initialization completes
    isInitializing = false;
    initializationPromise = null;
  }
};

export const login = () => {
  if (!keycloakInstance) {
    console.error('[Keycloak] Not initialized, cannot login');
    return;
  }
  keycloakInstance.login();
};

export const logout = () => {
  if (!keycloakInstance) {
    console.error('[Keycloak] Not initialized, cannot logout');
    return;
  }
  keycloakInstance.logout();
};

export const getToken = (): string | undefined => {
  return keycloakInstance?.token;
};

export const getTokenParsed = () => {
  return keycloakInstance?.tokenParsed;
};

export const isAuthenticated = (): boolean => {
  return keycloakInstance?.authenticated || false;
};

export const hasRole = (role: string): boolean => {
  return keycloakInstance?.hasRealmRole(role) || false;
};

export const getUserInfo = () => {
  if (!keycloakInstance) {
    console.error('[Keycloak] Not initialized, cannot get user info');
    return null;
  }
  return keycloakInstance.loadUserInfo();
};

export const updateToken = (minValidity: number = 5) => {
  if (!keycloakInstance) {
    console.error('[Keycloak] Not initialized, cannot update token');
    return Promise.reject(new Error('Keycloak not initialized'));
  }
  return keycloakInstance.updateToken(minValidity);
};

export const getKeycloakInstance = (): Keycloak | null => {
  return keycloakInstance;
};
