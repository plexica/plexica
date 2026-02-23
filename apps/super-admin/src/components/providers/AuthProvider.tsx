// File: apps/super-admin/src/components/providers/AuthProvider.tsx

import React, { useEffect, useCallback, useRef } from 'react';
import * as keycloak from '@/lib/keycloak';
import { useAuthStore } from '@/stores/auth-store';
import { AuthContext, User } from '@/contexts/AuthContext';

/**
 * Super Admin Authentication Context
 *
 * Manages Keycloak SSO authentication for plexica-admin realm
 *
 * KEY FEATURES:
 * - Single Sign-On with Keycloak
 * - Automatic token refresh
 * - Role-based access control (super-admin role required)
 * - No tenant context (platform-wide access)
 */

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * AuthProvider with Keycloak SSO Integration + Zustand Store
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // Use Zustand store for state management
  const {
    user,
    isAuthenticated,
    isLoading,
    setAuth,
    clearAuth: clearAuthStore,
    setLoading,
  } = useAuthStore();

  const loadUserInfo = useCallback(async () => {
    try {
      const tokenParsed = keycloak.getTokenParsed();
      const userInfo = await keycloak.getUserInfo();
      const token = keycloak.getToken();

      if (tokenParsed && userInfo && token) {
        const userData: User = {
          id: tokenParsed.sub || '',
          email: ((userInfo as Record<string, unknown>).email as string) || tokenParsed.email || '',
          name:
            ((userInfo as Record<string, unknown>).name as string) ||
            tokenParsed.name ||
            'Super Admin',
          roles: tokenParsed.realm_access?.roles || [],
        };

        // Update Zustand store
        setAuth(userData, token);
        console.log('[AuthProvider] User loaded and stored:', userData);
      }
    } catch (error) {
      console.error('[AuthProvider] Failed to load user info:', error);
      clearAuthStore();
    }
  }, [setAuth, clearAuthStore]);

  const initAuth = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[AuthProvider] Initializing Keycloak...');
      const authenticated = await keycloak.initKeycloak();

      if (authenticated) {
        await loadUserInfo();
      } else {
        // Not authenticated, clear store
        clearAuthStore();
      }
    } catch (error) {
      console.error('[AuthProvider] Keycloak initialization failed:', error);
      clearAuthStore();
    } finally {
      setLoading(false);
    }
  }, [setLoading, loadUserInfo, clearAuthStore]);

  // Guard against double-initialization (e.g. React StrictMode double-invoke,
  // HMR, or Zustand store recreation). Keycloak.initKeycloak() is not idempotent.
  const initCalledRef = useRef(false);

  useEffect(() => {
    if (initCalledRef.current) return;
    initCalledRef.current = true;
    initAuth();
  }, [initAuth]);

  const login = () => {
    console.log('[AuthProvider] Redirecting to Keycloak login...');
    keycloak.login();
  };

  const logout = () => {
    console.log('[AuthProvider] Logging out...');
    clearAuthStore();
    keycloak.logout();
  };

  const hasRole = (role: string): boolean => {
    return keycloak.hasRole(role);
  };

  const isSuperAdmin = (): boolean => {
    return keycloak.isSuperAdmin();
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        user,
        login,
        logout,
        hasRole,
        isSuperAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
