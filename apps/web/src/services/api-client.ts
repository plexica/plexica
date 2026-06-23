// api-client.ts
// Configured fetch wrapper with auth token injection and 401 handling.
// Attaches Authorization and X-Tenant-Slug headers on every request.
// On 401: attempts token refresh; if failed, emits sessionExpired + redirects.

// API paths already include the /api/v1 prefix (e.g. /api/v1/workspaces).
// The Vite dev proxy forwards /api/* → http://localhost:3001 without rewriting,
// so API_BASE must be empty to avoid doubling the prefix (/api/api/v1/…).
// When VITE_API_URL is set (e.g. in CI pointing to a real backend), it should
// NOT include /api — e.g. "http://localhost:3001", not "http://localhost:3001/api".
const API_BASE = import.meta.env.VITE_API_URL ?? '';

// L-8: module-level lazy cache avoids the dynamic import() overhead on every
// API call while still breaking the circular dependency between api-client
// (which needs auth tokens) and auth-store (which calls api-client).
let _authStoreModule: {
  useAuthStore: typeof import('../stores/auth-store.js').useAuthStore;
} | null = null;

async function getAuthStore() {
  if (_authStoreModule === null) {
    _authStoreModule = await import('../stores/auth-store.js');
  }
  return _authStoreModule.useAuthStore.getState();
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

async function buildHeaders(
  extra?: Record<string, string>,
  hasBody = false
): Promise<Record<string, string>> {
  const store = await getAuthStore();
  const headers: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...extra,
  };

  if (store.accessToken !== null) {
    headers['Authorization'] = `Bearer ${store.accessToken}`;
  }

  if (store.tenantSlug !== null) {
    headers['X-Tenant-Slug'] = store.tenantSlug;
  }

  return headers;
}

async function request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
  const url = `${API_BASE}${path}`;
  const hasBody = options?.body !== undefined;
  const headers = await buildHeaders(options?.headers, hasBody);

  const response = await fetch(url, {
    method,
    headers,
    ...(options?.body !== undefined && { body: JSON.stringify(options.body) }),
  });

  if (response.status === 401) {
    // Attempt token refresh once
    const store = await getAuthStore();
    try {
      await store.refresh();
      // Retry with new token
      const retryHeaders = await buildHeaders(options?.headers, hasBody);
      const retryResponse = await fetch(url, {
        method,
        headers: retryHeaders,
        ...(options?.body !== undefined && { body: JSON.stringify(options.body) }),
      });
      if (!retryResponse.ok) {
        // The retry itself failed (e.g. 403 Forbidden, 404 Not Found).
        // This is NOT a session expiry — the refresh succeeded and returned a
        // valid token, so the session is still alive. Throw a normal error so
        // the caller can handle the specific HTTP status, not a session-expired
        // redirect. setSessionExpired() must only be called when refresh() throws.
        const errBody = (await retryResponse.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(
          errBody.error?.message ?? `Request failed after token refresh: ${retryResponse.status}`
        );
      }
      // 204 No Content — no body to parse
      if (retryResponse.status === 204) {
        return undefined as T;
      }
      return retryResponse.json() as Promise<T>;
    } catch (err) {
      // refresh() threw — the refresh token is expired or revoked.
      // Only in this case is the session actually expired.
      if (err instanceof Error && err.message.startsWith('Request failed after token refresh')) {
        // Rethrow — this is an API error, not a session expiry.
        throw err;
      }
      store.setSessionExpired();
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errorBody.error?.message ?? `Request failed: ${response.status}`);
  }

  // 204 No Content — no body to parse
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};
