// apps/web/src/lib/api-client.ts
//
// Thin wrapper around @plexica/api-client TenantApiClient.
// Exports a singleton `apiClient` that preserves the same API surface
// used by all existing consumers (setToken, setTenantSlug, setWorkspaceId,
// getWorkspaceId, clearAuth, plus all endpoint methods).

import { TenantApiClient } from '@plexica/api-client';

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
