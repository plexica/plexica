// apps/super-admin/src/stores/auth-store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jwtDecode } from 'jwt-decode';
import * as keycloak from '@/lib/keycloak';
import { saveToken, getToken, clearToken } from '@/lib/secure-storage';

/**
 * Super Admin Authentication Store
 *
 * KEY DIFFERENCES from tenant app:
 * - NO tenant field (platform-wide access)
 * - NO workspace field (no workspace concept)
 * - Uses Keycloak token directly
 * - Super-admin role required
 * - Simpler state management
 */

interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  refreshUser: () => Promise<void>;
  hasRole: (role: string) => boolean;
  isSuperAdmin: () => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      setAuth: (user, token) => {
        console.log('[AuthStore] Setting authentication', { user: user.email });
        // SECURITY: Use secure storage (sessionStorage) for token instead of localStorage
        saveToken(token);
        set({
          user,
          token,
          isAuthenticated: true,
        });
      },

      setUser: (user) => {
        console.log('[AuthStore] Setting user, isAuthenticated = true');
        set({ user, isAuthenticated: true });
      },

      setToken: (token) => {
        console.log('[AuthStore] Setting token');
        // SECURITY: Use secure storage (sessionStorage) for token
        saveToken(token);
        set({ token });
      },

      clearAuth: () => {
        console.log('[AuthStore] Clearing authentication');
        // Clear token from secure storage
        clearToken();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      refreshUser: async () => {
        try {
          console.log('[AuthStore] Refreshing user info...');
          const tokenParsed = keycloak.getTokenParsed();
          const userInfo = await keycloak.getUserInfo();

          if (tokenParsed && userInfo) {
            const userData: User = {
              id: tokenParsed.sub || '',
              email: (userInfo as any).email || tokenParsed.email || '',
              name: (userInfo as any).name || tokenParsed.name || 'Super Admin',
              roles: tokenParsed.realm_access?.roles || [],
            };

            set({ user: userData });
            console.log('[AuthStore] User info refreshed:', userData);
          }
        } catch (error) {
          console.error('[AuthStore] Failed to refresh user:', error);
          get().clearAuth();
        }
      },

      hasRole: (role: string) => {
        const user = get().user;
        if (!user) return false;
        return user.roles.includes(role);
      },

      isSuperAdmin: () => {
        return get().hasRole('super-admin');
      },
    }),
    {
      name: 'super-admin-auth',
      partialize: (state) => ({
        user: state.user,
        // SECURITY: Don't persist token to localStorage
        // Token is managed separately via secure-storage.ts (sessionStorage + memory)
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          console.log('[AuthStore] Rehydrating store...');

          // CRITICAL: Validate token expiry on rehydration
          // Restore token from secure storage (sessionStorage)
          const token = getToken();
          if (token) {
            try {
              const decoded = jwtDecode(token) as any;
              const expiryTime = decoded.exp ? decoded.exp * 1000 : null;

              if (!expiryTime || Date.now() >= expiryTime) {
                console.warn('[AuthStore] Token expired during rehydration, clearing auth');
                clearToken();
                state.clearAuth?.();
                return;
              }

              // Token is still valid, restore it
              state.token = token;
              console.log('[AuthStore] Token restored from secure storage');
            } catch (error) {
              console.error('[AuthStore] Failed to decode token during rehydration:', error);
              clearToken();
              state.clearAuth?.();
              return;
            }
          } else {
            // No token found, clear authentication
            console.log('[AuthStore] No token found, clearing auth state');
            state.clearAuth?.();
          }
        }
      },
    }
  )
);

// Expose auth store instance globally for Keycloak token refresh error handling
if (typeof window !== 'undefined') {
  (window as any).__authStoreInstance = useAuthStore;
}
