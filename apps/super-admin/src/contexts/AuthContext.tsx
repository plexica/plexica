// File: apps/super-admin/src/contexts/AuthContext.tsx

import { createContext, useContext } from 'react';
import type { User } from '@plexica/types';

/**
 * Shared Authentication Context
 * Used by both AuthProvider (real Keycloak) and MockAuthProvider (E2E tests)
 */

export type { User };

export interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  login: () => void;
  logout: () => void;
  hasRole: (role: string) => boolean;
  isSuperAdmin: () => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
