// apps/web/src/lib/api-client.ts
//
// Thin wrapper around @plexica/api-client TenantApiClient.
// Exports a singleton `apiClient` that preserves the same API surface
// used by all existing consumers (setToken, setTenantSlug, setWorkspaceId,
// getWorkspaceId, clearAuth, plus all endpoint methods).
//
// Also exports `adminApiClient` — a singleton AdminApiClient for super-admin
// plugin lifecycle operations (install, cancel, get registry plugin).

import { TenantApiClient, AdminApiClient } from '@plexica/api-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class WebApiClient extends TenantApiClient {
  private _token: string | null = null;

  constructor() {
    super({ baseUrl: API_URL });

    // Wire up a simple token provider that uses the stored token.
    // The auth store calls `setToken()` whenever the token changes.
    this.setAuthProvider({
      getToken: () => this._token,
      onAuthFailure: () => {
        console.warn('[ApiClient] 401 Unauthorized detected');
        this.clearAuth();
      },
    });
  }

  /**
   * Store the current access token.
   * Called by auth-store.ts whenever the Keycloak token changes.
   */
  setToken(token: string): void {
    this._token = token;
  }

  /**
   * Clear all auth and tenant state.
   */
  clearAuth(): void {
    this._token = null;
    this.clearContext();
  }
}

export const apiClient = new WebApiClient();
export default apiClient;

// ---------------------------------------------------------------------------
// Admin API Client
// ---------------------------------------------------------------------------
// Super-admin singleton used for platform-level plugin lifecycle operations:
// installPlugin, cancelInstall, getRegistryPlugin, etc.
// auth-store.ts calls `adminApiClient.setToken()` alongside apiClient when the
// Keycloak token changes.

class WebAdminApiClient extends AdminApiClient {
  private _token: string | null = null;

  constructor() {
    super({ baseUrl: API_URL });

    this.setAuthProvider({
      getToken: () => this._token,
      onAuthFailure: () => {
        // Mirror the tenant client behaviour: clear auth state on 401.
        // The auth-store Keycloak lifecycle handler will trigger a logout/redirect.
        this.clearAuth();
      },
    });
  }

  setToken(token: string): void {
    this._token = token;
  }

  clearAuth(): void {
    this._token = null;
  }
}

export const adminApiClient = new WebAdminApiClient();
