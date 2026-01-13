// File: apps/web/src/components/AuthProvider.tsx

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import { initKeycloak, isAuthenticated, getUserInfo, login } from '../lib/keycloak';
import { useAuthStore } from '../stores/auth-store';

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
  const { setUser, setToken, clearAuth, tenant } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('[AuthProvider] Initializing Keycloak...');
        const authenticated = await initKeycloak();

        if (authenticated) {
          console.log('[AuthProvider] User authenticated, fetching user info...');
          const userInfo = await getUserInfo();

          if (userInfo) {
            const fullName =
              [userInfo.given_name, userInfo.family_name].filter(Boolean).join(' ') ||
              userInfo.email ||
              'Unknown User';

            setUser({
              id: userInfo.sub,
              email: userInfo.email || '',
              name: fullName,
              tenantId: '', // Will be set when tenant is selected
              roles: userInfo.realm_access?.roles || [],
              permissions: [], // Will be fetched from backend
            });

            // Get token and store it
            const keycloak = (window as any).keycloak;
            if (keycloak?.token) {
              setToken(keycloak.token);
            }

            console.log('[AuthProvider] User info stored:', userInfo);

            // Redirect to tenant selection if no tenant is selected and not already there
            if (
              !tenant &&
              location.pathname !== '/select-tenant' &&
              location.pathname !== '/login'
            ) {
              navigate({ to: '/select-tenant' });
            }
          }
        } else {
          console.log('[AuthProvider] User not authenticated');
          clearAuth();
        }
      } catch (error) {
        console.error('[AuthProvider] Initialization error:', error);
        clearAuth();
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [setUser, setToken, clearAuth, tenant, navigate, location]);

  const handleLogin = () => {
    login();
  };

  const handleLogout = () => {
    clearAuth();
    const keycloak = (window as any).keycloak;
    if (keycloak) {
      keycloak.logout();
    }
  };

  const hasRole = (role: string): boolean => {
    const keycloak = (window as any).keycloak;
    return keycloak?.hasRealmRole(role) || false;
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
