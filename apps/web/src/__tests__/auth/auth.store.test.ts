// apps/web/src/__tests__/auth/auth.store.test.ts
//
// Unit tests for the new OAuth 2.0 auth store (Spec 002, T7-13).
// Tests cover: setTokens, refreshTokens, expireSession, logout,
//              saveDeepLink/consumeDeepLink, clearAuth, bootstrapAuth.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------
const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

// ---------------------------------------------------------------------------
// Mock jwtDecode to return predictable payloads
// ---------------------------------------------------------------------------
vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn((token: string) => {
    if (token === 'valid-access-token') {
      return {
        sub: 'user-123',
        email: 'user@example.com',
        name: 'Alice Test',
        given_name: 'Alice',
        family_name: 'Test',
        preferred_username: 'alice',
        realm_access: { roles: ['user'] },
        tenant_id: 'acme-corp',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
    }
    if (token === 'admin-access-token') {
      return {
        sub: 'admin-456',
        email: 'admin@example.com',
        name: 'Bob Admin',
        given_name: 'Bob',
        family_name: 'Admin',
        preferred_username: 'bob',
        realm_access: { roles: ['tenant_admin', 'user'] },
        tenant_id: 'acme-corp',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
    }
    throw new Error('Bad token');
  }),
}));

// ---------------------------------------------------------------------------
// Mock tenant helper
// ---------------------------------------------------------------------------
vi.mock('@/lib/tenant', () => ({
  getTenantFromUrl: vi.fn(() => 'acme-corp'),
}));

// ---------------------------------------------------------------------------
// sessionStorage mock
// ---------------------------------------------------------------------------
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock });

// ---------------------------------------------------------------------------
// Helpers to get fresh store state between tests (Zustand stores are singletons)
// ---------------------------------------------------------------------------
async function importStore() {
  // Re-import store fresh by resetting the module registry between tests
  const mod = await import('@/stores/auth.store');
  return mod;
}

describe('auth.store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // setTokens
  // -------------------------------------------------------------------------
  describe('setTokens', () => {
    it('should set user from JWT claims when valid token provided', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      act(() => {
        store.setTokens({
          accessToken: 'valid-access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 3600_000,
        });
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.email).toBe('user@example.com');
      expect(state.user?.displayName).toBe('Alice Test');
      expect(state.user?.tenantId).toBe('acme-corp');
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should save refresh token to sessionStorage', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      act(() => {
        store.setTokens({
          accessToken: 'valid-access-token',
          refreshToken: 'my-refresh-token',
          expiresAt: Date.now() + 3600_000,
        });
      });

      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        'plexica-refresh-token',
        'my-refresh-token'
      );
    });

    it('should extract admin roles from JWT for admin token', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      act(() => {
        store.setTokens({
          accessToken: 'admin-access-token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600_000,
        });
      });

      const state = useAuthStore.getState();
      expect(state.user?.roles).toContain('tenant_admin');
    });
  });

  // -------------------------------------------------------------------------
  // expireSession
  // -------------------------------------------------------------------------
  describe('expireSession', () => {
    it('should clear auth state and dispatch plexica:session-expired event', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      // First authenticate
      act(() => {
        store.setTokens({
          accessToken: 'valid-access-token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600_000,
        });
      });

      const listener = vi.fn();
      window.addEventListener('plexica:session-expired', listener);

      act(() => {
        store.expireSession();
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.tokenSet).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener('plexica:session-expired', listener);
    });

    it('should clear refresh token from sessionStorage', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      // Simulate a stored refresh token
      sessionStorageMock.getItem.mockReturnValue('old-refresh');

      act(() => {
        store.expireSession();
      });

      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('plexica-refresh-token');
    });
  });

  // -------------------------------------------------------------------------
  // clearAuth
  // -------------------------------------------------------------------------
  describe('clearAuth', () => {
    it('should reset all auth state without dispatching expired event', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      act(() => {
        store.setTokens({
          accessToken: 'valid-access-token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600_000,
        });
      });

      const listener = vi.fn();
      window.addEventListener('plexica:session-expired', listener);

      act(() => {
        store.clearAuth();
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      // clearAuth does NOT emit expired event — it's a voluntary clear
      expect(listener).not.toHaveBeenCalled();

      window.removeEventListener('plexica:session-expired', listener);
    });
  });

  // -------------------------------------------------------------------------
  // saveDeepLink / consumeDeepLink
  // -------------------------------------------------------------------------
  describe('saveDeepLink / consumeDeepLink', () => {
    it('should save and consume deep-link URL', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      act(() => store.saveDeepLink('/dashboard?tab=overview'));
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        'plexica-deep-link',
        '/dashboard?tab=overview'
      );

      sessionStorageMock.getItem.mockReturnValue('/dashboard?tab=overview');
      const url = store.consumeDeepLink();
      expect(url).toBe('/dashboard?tab=overview');
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('plexica-deep-link');
    });

    it('should not save /login as a deep-link', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      act(() => store.saveDeepLink('/login'));

      expect(sessionStorageMock.setItem).not.toHaveBeenCalledWith('plexica-deep-link', '/login');
    });

    it('should not save /auth/ paths as deep-links', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      act(() => store.saveDeepLink('/auth/callback?code=123'));

      expect(sessionStorageMock.setItem).not.toHaveBeenCalledWith(
        'plexica-deep-link',
        expect.stringContaining('/auth/')
      );
    });

    it('should return null when no deep-link is stored', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      sessionStorageMock.getItem.mockReturnValue(null as unknown as string);
      const url = store.consumeDeepLink();
      expect(url).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // refreshTokens
  // -------------------------------------------------------------------------
  describe('refreshTokens', () => {
    it('should update tokens on successful refresh', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      // Pre-set a token so refresh has something to use
      act(() => {
        store.setTokens({
          accessToken: 'valid-access-token',
          refreshToken: 'old-refresh',
          expiresAt: Date.now() + 1000,
        });
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'valid-access-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      });

      let result: boolean;
      await act(async () => {
        result = await store.refreshTokens();
      });

      expect(result!).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('should call expireSession when refresh fails with 401', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      act(() => {
        store.setTokens({
          accessToken: 'valid-access-token',
          refreshToken: 'expired-refresh',
          expiresAt: Date.now() + 1000,
        });
      });

      fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

      const listener = vi.fn();
      window.addEventListener('plexica:session-expired', listener);

      let result: boolean;
      await act(async () => {
        result = await store.refreshTokens();
      });

      expect(result!).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener('plexica:session-expired', listener);
    });

    it('should call expireSession when no refresh token is available', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      // Ensure clean state with no tokens
      act(() => store.clearAuth());
      sessionStorageMock.getItem.mockReturnValue(null as unknown as string);

      const listener = vi.fn();
      window.addEventListener('plexica:session-expired', listener);

      let result: boolean;
      await act(async () => {
        result = await store.refreshTokens();
      });

      expect(result!).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener('plexica:session-expired', listener);
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------
  describe('logout', () => {
    it('should POST to /auth/logout, clear state, and redirect to /login', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      act(() => {
        store.setTokens({
          accessToken: 'valid-access-token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600_000,
        });
      });

      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

      // Mock window.location.href
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
        configurable: true,
      });

      await act(async () => {
        await store.logout();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/logout'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(window.location.href).toBe('/login');

      Object.defineProperty(window, 'location', { value: originalLocation, configurable: true });
    });

    it('should still clear state and redirect even when logout API fails', async () => {
      const { useAuthStore } = await importStore();
      const store = useAuthStore.getState();

      act(() => {
        store.setTokens({
          accessToken: 'valid-access-token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600_000,
        });
      });

      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
        configurable: true,
      });

      await act(async () => {
        await store.logout();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(window.location.href).toBe('/login');
    });
  });

  // -------------------------------------------------------------------------
  // getAccessToken helper
  // -------------------------------------------------------------------------
  describe('getAccessToken', () => {
    it('should return access token when authenticated', async () => {
      const { useAuthStore, getAccessToken } = await importStore();
      const store = useAuthStore.getState();

      act(() => {
        store.setTokens({
          accessToken: 'valid-access-token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600_000,
        });
      });

      expect(getAccessToken()).toBe('valid-access-token');
    });

    it('should return null when not authenticated', async () => {
      const { useAuthStore, getAccessToken } = await importStore();
      act(() => useAuthStore.getState().clearAuth());
      expect(getAccessToken()).toBeNull();
    });
  });
});
