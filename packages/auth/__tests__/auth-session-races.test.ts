import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storeAuthorizationRequest } from '../src/authorization-request.js';

import { MemoryStorage, tokenResponse } from './test-helpers.js';

interface TestWindow {
  location: { origin: string; href: string };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('auth session races', () => {
  let testWindow: TestWindow;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    testWindow = { location: { origin: 'https://app.example.com', href: '' } };
    vi.stubGlobal('window', testWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should not resurrect admin tokens when refresh settles after logout', async () => {
    const { queryClient } = await import('../../../apps/admin/src/services/query-client.js');
    const { keycloakClient } = await import('../../../apps/admin/src/services/keycloak-auth.js');
    const refresh = deferred<ReturnType<typeof tokenResponse>>();
    vi.spyOn(keycloakClient, 'refreshTokens').mockReturnValue(refresh.promise);
    vi.spyOn(keycloakClient, 'revokeSession').mockResolvedValue(undefined);
    vi.spyOn(keycloakClient, 'getLogoutUrl').mockReturnValue('https://id.example.com/logout');
    const clearCache = vi.spyOn(queryClient, 'clear');
    const { useAuthStore } = await import('../../../apps/admin/src/stores/auth-store.js');
    useAuthStore.setState({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      idToken: 'old-id',
      status: 'authenticated',
      isAuthenticated: true,
    });

    const pendingRefresh = useAuthStore.getState().refresh();
    await vi.waitFor(() => expect(keycloakClient.refreshTokens).toHaveBeenCalledOnce());
    await useAuthStore.getState().logout();
    refresh.resolve(tokenResponse('new-id'));
    await pendingRefresh;

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(clearCache).toHaveBeenCalledTimes(2);
    expect(testWindow.location.href).toBe('https://id.example.com/logout');
  });

  it('should clear tenant cache and reject a refresh write after expiry', async () => {
    const { queryClient } = await import('../../../apps/web/src/services/query-client.js');
    const { keycloakClient } = await import('../../../apps/web/src/services/keycloak-auth.js');
    const refresh = deferred<ReturnType<typeof tokenResponse>>();
    vi.spyOn(keycloakClient, 'refreshTokens').mockReturnValue(refresh.promise);
    const { useAuthStore } = await import('../../../apps/web/src/stores/auth-store.js');
    useAuthStore.setState({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      idToken: 'old-id',
      tenantSlug: 'acme',
      realm: 'plexica-acme',
      status: 'authenticated',
      isAuthenticated: true,
    });
    queryClient.setQueryData(['profile'], { id: 'previous-user' });

    const pendingRefresh = useAuthStore.getState().refresh();
    await vi.waitFor(() => expect(keycloakClient.refreshTokens).toHaveBeenCalledOnce());
    useAuthStore.getState().setSessionExpired();
    refresh.resolve(tokenResponse('new-id'));
    await pendingRefresh;

    expect(useAuthStore.getState().status).toBe('expired');
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(queryClient.getQueryData(['profile'])).toBeUndefined();
  });

  it('should not expose previous-user query data after reauthentication', async () => {
    const { queryClient } = await import('../../../apps/admin/src/services/query-client.js');
    const { keycloakClient } = await import('../../../apps/admin/src/services/keycloak-auth.js');
    const { useAuthStore } = await import('../../../apps/admin/src/stores/auth-store.js');
    queryClient.setQueryData(['admin', 'profile'], { id: 'previous-user' });
    useAuthStore.getState().setSessionExpired();
    storeAuthorizationRequest('new-state', { codeVerifier: 'verifier', nonce: 'nonce' });
    vi.spyOn(keycloakClient, 'exchangeCode').mockResolvedValue(tokenResponse('new-id'));

    await useAuthStore.getState().handleCallback('code', 'new-state');

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(queryClient.getQueryData(['admin', 'profile'])).toBeUndefined();
  });
});
