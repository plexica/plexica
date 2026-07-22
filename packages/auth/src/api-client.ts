// api-client.ts
// Shared fetch wrapper factory for API calls with automatic auth token injection
// and 401-driven token refresh.
// Apps provide their own token source, refresh function, and optional extra headers
// (e.g. X-Tenant-Slug for the web app).

export interface ApiClientConfig {
  /** Base URL for API requests. Empty string for same-origin (dev proxy). */
  baseUrl?: string;

  /** Get the current auth state (access token + refresh token). */
  getTokens: () => { accessToken: string | null; refreshToken: string | null };

  /** Attempt to refresh the access token. Throws if refresh fails. */
  refreshTokens: () => Promise<void>;

  /** Called when token refresh fails (session expired). */
  onSessionExpired: () => void;

  /** Optional additional headers for every request (e.g. X-Tenant-Slug). */
  extraHeaders?: () => Record<string, string>;
}

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly conflictType: string | undefined;

  constructor(status: number, body: { code?: string; message?: string; conflictType?: string }) {
    super(body.message ?? `Request failed: ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'UNKNOWN';
    this.conflictType = body.conflictType;
  }
}

export function createApiClient(config: ApiClientConfig) {
  const { baseUrl = '', getTokens, refreshTokens, onSessionExpired, extraHeaders } = config;

  async function buildHeaders(
    optionsHeaders?: Record<string, string>,
    hasBody = false,
  ): Promise<Record<string, string>> {
    const { accessToken } = getTokens();
    const headers: Record<string, string> = {
      'Content-Type': hasBody ? 'application/json' : '',
      ...(extraHeaders !== undefined ? extraHeaders() : {}),
      ...optionsHeaders,
    };

    // Remove empty Content-Type header if no body
    if (!hasBody && headers['Content-Type'] === '') {
      delete headers['Content-Type'];
    }

    if (accessToken !== null) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return headers;
  }

  async function readErrorBody(response: Response): Promise<{ code?: string; message?: string; conflictType?: string }> {
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string; conflictType?: string } };
      return body.error ?? {};
    } catch {
      return {};
    }
  }

  async function request<T>(
    method: string,
    path: string,
    options?: RequestOptions,
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const hasBody = options?.body !== undefined;
    const headers = await buildHeaders(options?.headers, hasBody);

    const response = await fetch(url, {
      method,
      headers,
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    });

    if (response.status === 401) {
      try {
        await refreshTokens();
        const retryHeaders = await buildHeaders(options?.headers, hasBody);
        const retryResponse = await fetch(url, {
          method,
          headers: retryHeaders,
          ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
        });

        if (!retryResponse.ok) {
          // Refresh succeeded but the API returned a non-401 error — throw ApiError
          // so callers can inspect status and code.
          throw new ApiError(retryResponse.status, await readErrorBody(retryResponse));
        }

        if (retryResponse.status === 204) {
          return undefined as T;
        }

        return retryResponse.json() as Promise<T>;
      } catch (err) {
        if (err instanceof ApiError) {
          throw err;
        }
        // Refresh failed — session truly expired.
        onSessionExpired();
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      throw new ApiError(response.status, await readErrorBody(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
      request<T>('GET', path, options),

    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>('POST', path, { ...options, body }),

    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>('PATCH', path, { ...options, body }),

    delete: <T>(path: string, options?: RequestOptions) =>
      request<T>('DELETE', path, options),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
