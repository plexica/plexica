// apps/web/src/lib/keycloak.ts

import Keycloak from 'keycloak-js';
import type { KeycloakConfig, KeycloakInitOptions } from 'keycloak-js';

const keycloakConfig: KeycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'master',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'plexica-web',
};

const keycloak = new Keycloak(keycloakConfig);

const initOptions: KeycloakInitOptions = {
  onLoad: 'check-sso',
  silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
  pkceMethod: 'S256',
  checkLoginIframe: false,
};

let isInitialized = false;

export const initKeycloak = async (): Promise<boolean> => {
  if (isInitialized) {
    return keycloak.authenticated || false;
  }

  try {
    const authenticated = await keycloak.init(initOptions);
    isInitialized = true;

    // Setup token refresh
    if (authenticated && keycloak.token) {
      // Refresh token every 60 seconds
      setInterval(() => {
        keycloak
          .updateToken(70)
          .then((refreshed) => {
            if (refreshed) {
              console.log('Token refreshed');
            }
          })
          .catch(() => {
            console.error('Failed to refresh token');
          });
      }, 60000);
    }

    return authenticated;
  } catch (error) {
    console.error('Failed to initialize Keycloak:', error);
    return false;
  }
};

export const login = () => {
  keycloak.login();
};

export const logout = () => {
  keycloak.logout();
};

export const getToken = (): string | undefined => {
  return keycloak.token;
};

export const getTokenParsed = () => {
  return keycloak.tokenParsed;
};

export const isAuthenticated = (): boolean => {
  return keycloak.authenticated || false;
};

export const hasRole = (role: string): boolean => {
  return keycloak.hasRealmRole(role);
};

export const getUserInfo = () => {
  return keycloak.loadUserInfo();
};

export const updateToken = (minValidity: number = 5) => {
  return keycloak.updateToken(minValidity);
};

export { keycloak };
export default keycloak;
