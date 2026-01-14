// File: apps/web/src/components/AuthProvider.tsx

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import {
  initKeycloak,
  isAuthenticated,
  getUserInfo,
  login,
  getToken,
  logout as keycloakLogout,
  hasRole as keycloakHasRole,
  getCurrentTenantSlug,
} from '../lib/keycloak';
import { useAuthStore } from '../stores/auth-store';
import { apiClient } from '../lib/api-client';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const initializingRef = useRef(false);
  const { setUser, setToken, setTenant, clearAuth } = useAuthStore();

  useEffect(() => {
    // Prevent multiple initializations using ref (survives re-renders)
    if (initializingRef.current) {
      console.log('[AuthProvider] Initialization already in progress, skipping');
      return;
    }

    console.log('[AuthProvider] Starting initialization...');
    initializingRef.current = true; // Set immediately to prevent concurrent calls

    const initialize = async () => {
      try {
        // Get tenant from URL
        const tenantSlug = getCurrentTenantSlug();
        console.log('[AuthProvider] Step 1: Tenant from URL:', tenantSlug);

        console.log('[AuthProvider] Step 2: Calling initKeycloak()...');
        const authenticated = await initKeycloak();
        console.log('[AuthProvider] Step 3: initKeycloak() returned:', authenticated);

        if (authenticated) {
          console.log('[AuthProvider] Step 4: User authenticated, fetching user info...');
          const userInfo = await getUserInfo();

          if (userInfo) {
            console.log('[AuthProvider] Step 5: User info received, processing...');
            const fullName =
              [userInfo.given_name, userInfo.family_name].filter(Boolean).join(' ') ||
              userInfo.email ||
              'Unknown User';

            // Fetch tenant info from backend using the slug from URL
            console.log('[AuthProvider] Step 6: Fetching tenant info for:', tenantSlug);
            try {
              const tenantInfo = await apiClient.getTenantBySlug(tenantSlug);
              console.log('[AuthProvider] Step 7: Tenant info received:', tenantInfo);

              setUser({
                id: userInfo.sub,
                email: userInfo.email || '',
                name: fullName,
                tenantId: tenantInfo.id,
                roles: userInfo.realm_access?.roles || [],
                permissions: [], // Will be fetched from backend
              });

              setTenant(tenantInfo);
            } catch (tenantError) {
              console.error('[AuthProvider] Failed to fetch tenant info:', tenantError);
              // Show error to user - tenant not found or inaccessible
              clearAuth();
              setIsLoading(false);
              return;
            }

            // Get token and store it
            const token = getToken();
            if (token) {
              setToken(token);
              console.log('[AuthProvider] Step 8: Token stored');
            }

            console.log('[AuthProvider] Step 9: User info stored successfully');
          } else {
            console.warn('[AuthProvider] Step 5: No user info received from Keycloak');
          }
        } else {
          // Keycloak is not authenticated
          // Check if we have an auth code in the URL (Keycloak redirect in progress)
          const hasAuthCode =
            window.location.href.includes('code=') && window.location.href.includes('state=');

          if (hasAuthCode) {
            console.log('[AuthProvider] Auth code detected, waiting for Keycloak to process it');
            // Don't clear auth yet, Keycloak is processing the code
          } else {
            // No auth code, and Keycloak says not authenticated - clear session
            console.log('[AuthProvider] User not authenticated, clearing stored session');
            clearAuth();
          }
        }
      } catch (error) {
        console.error('[AuthProvider] ERROR in initialization:', error);
        // Clear auth on error - Keycloak is the source of truth
        clearAuth();
      } finally {
        console.log('[AuthProvider] Step 10 (FINAL): Setting isLoading to false');
        setIsLoading(false);
      }
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = () => {
    login();
  };

  const handleLogout = () => {
    clearAuth();
    keycloakLogout();
  };

  const hasRole = (role: string): boolean => {
    return keycloakHasRole(role);
  };

  const value: AuthContextType = {
    isLoading,
    isAuthenticated: isAuthenticated(),
    login: handleLogin,
    logout: handleLogout,
    hasRole,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
