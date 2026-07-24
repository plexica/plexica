import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  consumeAuthorizationRequest,
  storeAuthorizationRequest,
} from '../src/authorization-request.js';

import { MemoryStorage, makeAccessToken, tokenResponse } from './test-helpers.js';

interface TestWindow {
  location: { origin: string; href: string };
}

async function loadStore() {
  return import('../../../apps/admin/src/stores/auth-store.js');
}

async function loadClient() {
  return import('../../../apps/admin/src/services/keycloak-auth.js');
}

describe('admin auth store', () => {
  let storage: MemoryStorage;
  let testWindow: TestWindow;

  beforeEach(() => {
    vi.resetModules();
    storage = new MemoryStorage();
    testWindow = { location: { origin: 'https://admin.example.com', href: '' } };
    vi.stubGlobal('sessionStorage', storage);
    vi.stubGlobal('window', testWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should single-flight duplicate login initiation', async () => {
    const { keycloakClient } = await loadClient();
    const getLoginUrl = vi
      .spyOn(keycloakClient, 'getLoginUrl')
      .mockResolvedValue('https://id.example.com/auth');
    const { useAuthStore } = await loadStore();

    const first = useAuthStore.getState().login();
    const second = useAuthStore.getState().login();
    await Promise.all([first, second]);
    await useAuthStore.getState().login();

    expect(getLoginUrl).toHaveBeenCalledTimes(2);
    expect(getLoginUrl).toHaveBeenCalledWith(
      'master',
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
      'https://admin.example.com/callback'
    );
    expect(sessionStorage.getItem('auth_state')).toBeNull();
    expect(testWindow.location.href).toBe('https://id.example.com/auth');
  });

  it('should allow one single-flight retry after login initiation fails', async () => {
    const { keycloakClient } = await loadClient();
    const getLoginUrl = vi
      .spyOn(keycloakClient, 'getLoginUrl')
      .mockRejectedValueOnce(new Error('network detail'))
      .mockResolvedValue('https://id.example.com/auth');
    const { useAuthStore } = await loadStore();

    await expect(useAuthStore.getState().login()).rejects.toThrow(
      'Authentication could not be started'
    );
    const firstRetry = useAuthStore.getState().login();
    const duplicateRetry = useAuthStore.getState().login();
    await Promise.all([firstRetry, duplicateRetry]);

    expect(getLoginUrl).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().status).toBe('authenticating');
  });

  it('should exchange a duplicate callback only once', async () => {
    storeAuthorizationRequest('expected-state', { codeVerifier: 'verifier', nonce: 'nonce' });
    const { keycloakClient } = await loadClient();
    const exchange = vi
      .spyOn(keycloakClient, 'exchangeCode')
      .mockResolvedValue(tokenResponse('id-token'));
    const { useAuthStore } = await loadStore();

    const first = useAuthStore.getState().handleCallback('code', 'expected-state');
    const second = useAuthStore.getState().handleCallback('code', 'expected-state');
    await Promise.all([first, second]);

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange.mock.calls[0]?.[2]).toBe('verifier');
    expect(exchange.mock.calls[0]?.[4]).toBe('nonce');
    expect(useAuthStore.getState().status).toBe('authenticated');
    await expect(useAuthStore.getState().handleCallback('code', 'expected-state')).rejects.toThrow(
      'already been handled'
    );
  });

  it('should reject an unknown state before exchange', async () => {
    const { keycloakClient } = await loadClient();
    const exchange = vi.spyOn(keycloakClient, 'exchangeCode');
    const { useAuthStore } = await loadStore();

    await expect(useAuthStore.getState().handleCallback('code', 'unknown-state')).rejects.toThrow(
      'Authentication request is missing or invalid'
    );
    expect(exchange).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('should consume callback material when token exchange fails terminally', async () => {
    storeAuthorizationRequest('failed-state', { codeVerifier: 'verifier', nonce: 'nonce' });
    const { keycloakClient } = await loadClient();
    vi.spyOn(keycloakClient, 'exchangeCode').mockRejectedValue(new Error('exchange failed'));
    const { useAuthStore } = await loadStore();

    await expect(useAuthStore.getState().handleCallback('code', 'failed-state')).rejects.toThrow();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(() => consumeAuthorizationRequest('failed-state')).toThrow('missing or invalid');
  });

  it('should retain the ID token when refresh omits a replacement', async () => {
    const { keycloakClient } = await loadClient();
    vi.spyOn(keycloakClient, 'refreshTokens').mockResolvedValue(tokenResponse());
    const { useAuthStore } = await loadStore();
    useAuthStore.setState({ refreshToken: 'refresh-old', idToken: 'id-old' });

    await useAuthStore.getState().refresh();

    expect(useAuthStore.getState().idToken).toBe('id-old');
  });

  it('should persist expired through a real write and reload', async () => {
    const { useAuthStore } = await loadStore();
    useAuthStore.getState().setSessionExpired();
    expect(storage.getItem('plexica-admin-auth')).toContain('"status":"expired"');

    vi.resetModules();
    const { useAuthStore: reloadedStore } = await loadStore();
    await reloadedStore.persist.rehydrate();

    expect(reloadedStore.getState().status).toBe('expired');
    expect(reloadedStore.getState().isAuthenticated).toBe(false);
  });

  it('should persist the admin ID token and restore it on reload', async () => {
    const { useAuthStore } = await loadStore();
    useAuthStore.setState({
      accessToken: makeAccessToken(),
      refreshToken: 'refresh',
      idToken: 'id-persisted',
      status: 'authenticated',
      isAuthenticated: true,
    });

    vi.resetModules();
    const { useAuthStore: reloadedStore } = await loadStore();
    await reloadedStore.persist.rehydrate();

    expect(reloadedStore.getState().idToken).toBe('id-persisted');
    expect(reloadedStore.getState().status).toBe('authenticated');
  });

  it('should distinguish explicit logout from expiry and use front-channel logout', async () => {
    const { keycloakClient } = await loadClient();
    const { registerAuthQueryCacheClear } =
      await import('../../../apps/admin/src/services/auth-query-cache.js');
    const clearCache = vi.fn();
    registerAuthQueryCacheClear(clearCache);
    const logoutUrl = vi
      .spyOn(keycloakClient, 'getLogoutUrl')
      .mockReturnValue('https://id.example.com/logout');
    const { useAuthStore } = await loadStore();
    useAuthStore.setState({ refreshToken: 'refresh', idToken: 'id-token' });
    const revoke = vi.spyOn(keycloakClient, 'revokeSession').mockImplementation(() => {
      expect(useAuthStore.getState().refreshToken).toBeNull();
      expect(clearCache).toHaveBeenCalledTimes(1);
      return Promise.reject(new Error('non-2xx'));
    });

    const logout = useAuthStore.getState().logout();

    expect(logoutUrl).toHaveBeenCalledWith('master', 'id-token', 'https://admin.example.com/login');
    expect(revoke).toHaveBeenCalledWith('refresh');
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(storage.getItem('plexica-admin-auth')).not.toContain('expired');
    await logout;
    expect(testWindow.location.href).toBe('https://id.example.com/logout');
    vi.resetModules();
    const { useAuthStore: reloadedStore } = await loadStore();
    await reloadedStore.persist.rehydrate();
    expect(reloadedStore.getState().status).toBe('unauthenticated');
  });
});
