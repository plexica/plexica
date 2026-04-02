// api-client.ts
// Configured fetch wrapper with auth token injection and 401 handling.
// Attaches Authorization and X-Tenant-Slug headers on every request.
// On 401: attempts token refresh; if failed, emits sessionExpired + redirects.

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

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

async function buildHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const store = await getAuthStore();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
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
  const headers = await buildHeaders(options?.headers);

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
      const retryHeaders = await buildHeaders(options?.headers);
      const retryResponse = await fetch(url, {
        method,
        headers: retryHeaders,
        ...(options?.body !== undefined && { body: JSON.stringify(options.body) }),
      });
      if (!retryResponse.ok) throw new Error('Retry failed');
      return retryResponse.json() as Promise<T>;
    } catch {
      store.setSessionExpired();
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errorBody.error?.message ?? `Request failed: ${response.status}`);
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
