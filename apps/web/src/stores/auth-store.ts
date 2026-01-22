// apps/web/src/stores/auth-store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jwtDecode } from 'jwt-decode';
import type { User, Tenant } from '@/types';
import { apiClient } from '@/lib/api-client';

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
        set({ token });
      },

      clearAuth: () => {
        apiClient.clearAuth();
        set({
          user: null,
          tenant: null,
          token: null,
          isAuthenticated: false,
        });
      },

      setTenant: (tenant) => {
        apiClient.setTenantSlug(tenant.slug);
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
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Rehydrate API client with persisted values
        if (state) {
          // CRITICAL FIX #1: Validate token expiry on rehydration
          // If token is expired, clear auth immediately
          if (state.token) {
            try {
              const decoded = jwtDecode(state.token) as any;
              const expiryTime = decoded.exp ? decoded.exp * 1000 : null;

              if (!expiryTime || Date.now() >= expiryTime) {
                console.warn('[AuthStore] Token expired during rehydration, clearing auth');
                state.clearAuth?.();
                return;
              }

              // Token is still valid, rehydrate API client
              apiClient.setToken(state.token);
            } catch (error) {
              console.error('[AuthStore] Failed to decode token during rehydration:', error);
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
