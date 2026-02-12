// File: apps/super-admin/src/components/providers/MockAuthProvider.tsx

import React, { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { AuthContext, User } from '@/contexts/AuthContext';

/**
 * Mock Authentication Provider for E2E Tests
 *
 * This provider bypasses Keycloak and provides a mock authenticated user
 * for E2E testing purposes. It maintains the same interface as the real
 * AuthProvider so the app works seamlessly in test mode.
 *
 * ONLY USED WHEN: VITE_E2E_TEST_MODE=true
 */

interface MockAuthProviderProps {
  children: React.ReactNode;
}

/**
 * Mock AuthProvider that simulates an authenticated super-admin user
 */
export const MockAuthProvider: React.FC<MockAuthProviderProps> = ({ children }) => {
  const {
    user,
    isAuthenticated,
    isLoading,
    setAuth,
    clearAuth: clearAuthStore,
    setLoading,
  } = useAuthStore();

  // CRITICAL: Set loading=true synchronously BEFORE the first render so that
  // ProtectedRoute shows a loading spinner instead of redirecting to /login.
  // The useEffect below will then set the auth state and clear loading.
  if (!isAuthenticated && !isLoading) {
    useAuthStore.setState({ isLoading: true });
  }

  useEffect(() => {
    if (isAuthenticated) return; // Already initialized (e.g. re-render)

    console.log('[MockAuthProvider] Initializing mock authentication for E2E tests...');

    // Mock super-admin user
    const mockUser: User = {
      id: 'mock-super-admin-id',
      email: 'admin@plexica.local',
      name: 'Super Admin (E2E Test)',
      roles: ['super-admin', 'admin'],
    };

    // Mock JWT token (not a real JWT, just for testing)
    const mockToken = 'mock-jwt-token-for-e2e-testing';

    // Set auth in store
    setAuth(mockUser, mockToken);
    console.log('[MockAuthProvider] Mock user authenticated:', mockUser);

    setLoading(false);
  }, []);

  const login = () => {
    console.log('[MockAuthProvider] Mock login called (no-op in test mode)');
    // Already authenticated, do nothing
  };

  const logout = () => {
    console.log('[MockAuthProvider] Mock logout called');
    clearAuthStore();
  };

  const hasRole = (role: string): boolean => {
    // Check if mock user has the role
    return user?.roles.includes(role) || false;
  };

  const isSuperAdmin = (): boolean => {
    return user?.roles.includes('super-admin') || false;
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
