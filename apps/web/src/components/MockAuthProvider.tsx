// File: apps/web/src/components/MockAuthProvider.tsx

import React, { useEffect } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { AuthContext } from './AuthProvider';
import type { User, Tenant } from '@/types';

/**
 * Mock Authentication Provider for E2E Tests
 *
 * Bypasses Keycloak and provides a mock authenticated tenant user.
 * Uses the same AuthContext as the real AuthProvider so that useAuth()
 * and ProtectedRoute work seamlessly.
 *
 * ONLY USED WHEN: VITE_E2E_TEST_MODE=true
 */
interface MockAuthProviderProps {
  children: React.ReactNode;
}

export const MockAuthProvider: React.FC<MockAuthProviderProps> = ({ children }) => {
  const { isAuthenticated, isLoading, clearAuth, setLoading } = useAuthStore();

  // CRITICAL: Set loading=true synchronously BEFORE the first render so that
  // ProtectedRoute shows a loading spinner instead of redirecting to /login.
  if (!isAuthenticated && !isLoading) {
    useAuthStore.setState({ isLoading: true });
  }

  useEffect(() => {
    if (isAuthenticated) return;

    console.log('[MockAuthProvider] Initializing mock authentication for E2E tests...');

    const mockUser: User = {
      id: 'mock-tenant-user-id',
      email: 'user@acme-corp.plexica.local',
      name: 'Test User (E2E)',
      tenantId: 'mock-tenant-id',
      roles: ['admin', 'member'],
      permissions: ['workspace:manage', 'members:manage', 'plugins:manage'],
    };

    const mockTenant: Tenant = {
      id: 'mock-tenant-id',
      name: 'Acme Corp',
      slug: 'acme-corp',
      status: 'ACTIVE',
      settings: {},
      theme: {},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    };

    // Set user and tenant in store (don't use setToken — it tries to save to secure storage)
    const store = useAuthStore.getState();
    store.setUser(mockUser);
    store.setTenant(mockTenant);
    useAuthStore.setState({ token: 'mock-jwt-token-for-e2e-testing' });

    console.log('[MockAuthProvider] Mock user authenticated:', mockUser.email);

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = () => {
    console.log('[MockAuthProvider] Mock login called (no-op in test mode)');
  };

  const logout = () => {
    console.log('[MockAuthProvider] Mock logout called');
    clearAuth();
  };

  const hasRole = (role: string): boolean => {
    const user = useAuthStore.getState().user;
    return user?.roles.includes(role) || false;
  };

  const storeState = useAuthStore();

  // Mirror the real AuthProvider's loading screen behavior
  if (storeState.isLoading) {
    return (
      <AuthContext.Provider
        value={{
          isLoading: true,
          isAuthenticated: false,
          login,
          logout,
          hasRole,
        }}
      >
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-foreground">Loading...</p>
          </div>
        </div>
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        isLoading: false,
        isAuthenticated: storeState.isAuthenticated,
        login,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
