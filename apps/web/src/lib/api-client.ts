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

// ---------------------------------------------------------------------------
// Typed HTTP interface
// ---------------------------------------------------------------------------
// TenantApiClient exposes `get` and `patch` as public methods at runtime but
// they are not declared in the public TypeScript surface.  Rather than
// sprinkling `as unknown as` double-casts across the codebase, we declare the
// interface once here and re-export it alongside the singleton.

export interface ApiClient {
  get<T>(url: string): Promise<T>;
  patch<T>(url: string, body: unknown): Promise<T>;
}

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

// Cast once here so all consumers can call `apiClient.get()` / `apiClient.patch()`
// directly without repeating the double-cast at every call site (TD-012).
// TenantApiClient exposes these methods at runtime; the cast makes them visible
// to TypeScript via the ApiClient interface declared above.
export const apiClient: WebApiClient & ApiClient = new WebApiClient() as WebApiClient & ApiClient;
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

// Cast once here so consumers can call `adminApiClient.get<T>()` directly
// without repeating `as unknown as ApiClient` at every call site (M-02, TD-012).
// AdminApiClient extends HttpClient which exposes `get<T>` at runtime; the cast
// makes it visible to TypeScript via the ApiClient interface declared above.
export const adminApiClient: WebAdminApiClient & ApiClient =
  new WebAdminApiClient() as WebAdminApiClient & ApiClient;
