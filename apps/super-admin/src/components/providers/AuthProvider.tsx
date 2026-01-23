// File: apps/super-admin/src/components/providers/AuthProvider.tsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import * as keycloak from '@/lib/keycloak';

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

interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  login: () => void;
  logout: () => void;
  hasRole: (role: string) => boolean;
  isSuperAdmin: () => boolean;
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

/**
 * AuthProvider with Keycloak SSO Integration
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    try {
      console.log('[AuthProvider] Initializing Keycloak...');
      const authenticated = await keycloak.initKeycloak();

      setIsAuthenticated(authenticated);

      if (authenticated) {
        await loadUserInfo();
      }
    } catch (error) {
      console.error('[AuthProvider] Keycloak initialization failed:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserInfo = async () => {
    try {
      const tokenParsed = keycloak.getTokenParsed();
      const userInfo = await keycloak.getUserInfo();

      if (tokenParsed && userInfo) {
        const userData: User = {
          id: tokenParsed.sub || '',
          email: (userInfo as any).email || tokenParsed.email || '',
          name: (userInfo as any).name || tokenParsed.name || 'Super Admin',
          roles: tokenParsed.realm_access?.roles || [],
        };

        setUser(userData);
        console.log('[AuthProvider] User loaded:', userData);
      }
    } catch (error) {
      console.error('[AuthProvider] Failed to load user info:', error);
    }
  };

  const login = () => {
    console.log('[AuthProvider] Redirecting to Keycloak login...');
    keycloak.login();
  };

  const logout = () => {
    console.log('[AuthProvider] Logging out...');
    setUser(null);
    setIsAuthenticated(false);
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
