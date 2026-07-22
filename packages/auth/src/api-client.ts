export interface ApiClientConfig {
  baseUrl?: string;
  getTokens: () => { accessToken: string | null; refreshToken: string | null };
  refreshTokens: () => Promise<void>;
  onSessionExpired: () => void;
  extraHeaders?: () => Record<string, string>;
}

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

interface ErrorBody {
  code?: string;
  message?: string;
  conflictType?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly conflictType: string | undefined;

  constructor(status: number, body: ErrorBody) {
    super(body.message ?? `Request failed: ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'UNKNOWN';
    this.conflictType = body.conflictType;
  }
}

export function createApiClient(config: ApiClientConfig) {
  const { baseUrl = '', getTokens, refreshTokens, onSessionExpired, extraHeaders } = config;
  let refreshFlight: Promise<void> | null = null;
  let expirationNotified = false;

  function expireSession(): Error {
    if (!expirationNotified) {
      expirationNotified = true;
      onSessionExpired();
    }
    return new Error('Session expired');
  }

  function refreshOnce(): Promise<void> {
    if (refreshFlight !== null) return refreshFlight;
    if (expirationNotified) return Promise.reject(new Error('Session expired'));
    const promise = refreshTokens().catch(() => {
      throw expireSession();
    });
    refreshFlight = promise;
    void promise
      .finally(() => {
        if (refreshFlight === promise) refreshFlight = null;
      })
      .catch(() => undefined);
    return promise;
  }

  function buildHeaders(optionsHeaders?: Record<string, string>, hasBody = false) {
    const headers: Record<string, string> = {
      ...(extraHeaders?.() ?? {}),
      ...optionsHeaders,
    };
    if (hasBody) headers['Content-Type'] = 'application/json';
    const { accessToken } = getTokens();
    if (accessToken !== null) headers['Authorization'] = `Bearer ${accessToken}`;
    return headers;
  }

  async function readErrorBody(response: Response): Promise<ErrorBody> {
    try {
      const value: unknown = await response.json();
      if (typeof value !== 'object' || value === null || !('error' in value)) return {};
      const error = value.error;
      if (typeof error !== 'object' || error === null) return {};
      const fields = error as Record<string, unknown>;
      return {
        ...(typeof fields['code'] === 'string' ? { code: fields['code'] } : {}),
        ...(typeof fields['message'] === 'string' ? { message: fields['message'] } : {}),
        ...(typeof fields['conflictType'] === 'string'
          ? { conflictType: fields['conflictType'] }
          : {}),
      };
    } catch {
      return {};
    }
  }

  async function parseResponse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async function request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    const url = `${baseUrl}${path}`;
    const hasBody = options?.body !== undefined;
    const body = hasBody ? JSON.stringify(options.body) : undefined;
    const response = await fetch(url, {
      method,
      headers: buildHeaders(options?.headers, hasBody),
      ...(body !== undefined ? { body } : {}),
    });

    if (response.status === 401) {
      await refreshOnce();
      const retryResponse = await fetch(url, {
        method,
        headers: buildHeaders(options?.headers, hasBody),
        ...(body !== undefined ? { body } : {}),
      });
      if (retryResponse.status === 401) throw expireSession();
      if (!retryResponse.ok) {
        throw new ApiError(retryResponse.status, await readErrorBody(retryResponse));
      }
      return parseResponse<T>(retryResponse);
    }

    if (!response.ok) throw new ApiError(response.status, await readErrorBody(response));
    return parseResponse<T>(response);
  }

  return {
    get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
      request<T>('GET', path, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>('POST', path, { ...options, body }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>('PATCH', path, { ...options, body }),
    delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
