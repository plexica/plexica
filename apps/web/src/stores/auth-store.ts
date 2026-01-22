// apps/web/src/stores/auth-store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jwtDecode } from 'jwt-decode';
import type { User, Tenant } from '@/types';
import { apiClient } from '@/lib/api-client';
import {
  saveToken,
  getToken,
  clearToken,
  saveTenant,
  clearTenant,
  broadcastTokenClear,
} from '@/lib/secure-storage';

interface AuthStore {
  user: User | null;
  tenant: Tenant | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (user: User, tenant: Tenant, token: string) => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  clearAuth: () => void;
  setTenant: (tenant: Tenant) => void;
  setLoading: (loading: boolean) => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      setAuth: (user, tenant, token) => {
        apiClient.setToken(token);
        apiClient.setTenantSlug(tenant.slug);
        // SECURITY: Use secure storage (sessionStorage) for token instead of localStorage
        saveToken(token);
        saveTenant(tenant);
        set({
          user,
          tenant,
          token,
          isAuthenticated: true,
        });
      },

      setUser: (user) => {
        console.log('[AuthStore] setUser called, setting isAuthenticated to true');
        set({ user, isAuthenticated: true });
      },

      setToken: (token) => {
        console.log('[AuthStore] setToken called');
        apiClient.setToken(token);
        // SECURITY: Use secure storage (sessionStorage) for token instead of localStorage
        saveToken(token);
        set({ token });
      },

      clearAuth: () => {
        apiClient.clearAuth();
        // SECURITY: Clear token from secure storage
        clearToken();
        clearTenant();
        // Broadcast logout to other tabs
        broadcastTokenClear();
        set({
          user: null,
          tenant: null,
          token: null,
          isAuthenticated: false,
        });
      },

      setTenant: (tenant) => {
        apiClient.setTenantSlug(tenant.slug);
        // SECURITY: Use secure storage (sessionStorage) for tenant
        saveTenant(tenant);
        set((state) => ({
          tenant,
          user: state.user ? { ...state.user, tenantId: tenant.id } : null,
          // Ensure we remain authenticated when setting tenant
          isAuthenticated: state.isAuthenticated || !!state.user,
        }));
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      refreshUser: async () => {
        try {
          const token = get().token;
          if (!token) return;

          apiClient.setToken(token);
          const userData = await apiClient.getCurrentUser();
          set({ user: userData });
        } catch (error) {
          console.error('Failed to refresh user:', error);
          get().clearAuth();
        }
      },
    }),
    {
      name: 'plexica-auth',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        // SECURITY: Don't persist token to localStorage
        // Token is managed separately via secure-storage.ts (sessionStorage + memory)
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Rehydrate API client with persisted values
        if (state) {
          // CRITICAL FIX #1: Validate token expiry on rehydration
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

              // Token is still valid, rehydrate API client
              apiClient.setToken(token);
              // Update state with restored token
              state.token = token;
            } catch (error) {
              console.error('[AuthStore] Failed to decode token during rehydration:', error);
              clearToken();
              state.clearAuth?.();
              return;
            }
          }
          if (state.tenant) {
            apiClient.setTenantSlug(state.tenant.slug);
          }
          console.log('[AuthStore] Rehydrated API client with valid token and tenant');
        }
      },
    }
  )
);
