// api-client.ts
// Configured fetch wrapper for admin API calls.
// Attaches the Authorization bearer token on every request.
// NO X-Tenant-Slug header — admin routes bypass tenant context (master realm).
// On 401: attempts a token refresh; if failed, marks the session as expired.

// API paths include the /api/v1 prefix (e.g. /api/v1/admin/tenants).
// The Vite dev proxy forwards /api/* -> http://localhost:3001 without rewriting,
// so API_BASE must be empty to avoid doubling the prefix.
// When VITE_API_URL is set (e.g. in CI), it should NOT include /api.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

// Module-level lazy cache breaks the circular dependency between api-client
// (which needs auth tokens) and auth-store (which calls api-client on logout).
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

  // Admin app: no X-Tenant-Slug header — admin endpoints operate cross-tenant.
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
    const store = await getAuthStore();
    try {
      await store.refresh();
      const retryHeaders = await buildHeaders(options?.headers, hasBody);
      const retryResponse = await fetch(url, {
        method,
        headers: retryHeaders,
        ...(options?.body !== undefined && { body: JSON.stringify(options.body) }),
      });
      if (!retryResponse.ok) {
        // Refresh succeeded but the API returned a non-401 error — not a session
        // expiry. Throw a normal error so callers can handle the HTTP status.
        const errBody = (await retryResponse.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(
          errBody.error?.message ?? `Request failed after token refresh: ${retryResponse.status}`
        );
      }
      if (retryResponse.status === 204) {
        return undefined as T;
      }
      return retryResponse.json() as Promise<T>;
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith('Request failed after token refresh')
      ) {
        throw err;
      }
      store.setSessionExpired();
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(errorBody.error?.message ?? `Request failed: ${response.status}`);
  }

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
