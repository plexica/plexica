export interface ApiClientConfig {
  baseUrl?: string;
  requestTimeoutMs?: number;
  getTokens: () => { accessToken: string | null; refreshToken: string | null };
  refreshTokens: () => Promise<void>;
  onSessionExpired: () => void;
  extraHeaders?: () => Record<string, string>;
}

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export const API_REQUEST_TIMEOUT_MS = 10_000;

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
  const {
    baseUrl = '',
    requestTimeoutMs = API_REQUEST_TIMEOUT_MS,
    getTokens,
    refreshTokens,
    onSessionExpired,
    extraHeaders,
  } = config;
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
    const value: unknown = await response.json();
    // Basic runtime validation: ensure the parsed JSON is an object or array.
    // Callers may further validate with Zod as needed.
    if (typeof value !== 'object' || value === null) {
      throw new ApiError(response.status, {
        code: 'INVALID_RESPONSE',
        message: 'Expected a JSON object or array response',
      });
    }
    return value as T;
  }

  function requestSignal(callerSignal?: AbortSignal): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    return callerSignal === undefined
      ? timeoutSignal
      : AbortSignal.any([callerSignal, timeoutSignal]);
  }

  function fetchRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    callerSignal?: AbortSignal
  ): Promise<Response> {
    return fetch(url, {
      method,
      headers,
      signal: requestSignal(callerSignal),
      ...(body !== undefined ? { body } : {}),
    });
  }

  async function request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    const url = `${baseUrl}${path}`;
    const hasBody = options?.body !== undefined;
    const body = hasBody ? JSON.stringify(options.body) : undefined;
    const response = await fetchRequest(
      url,
      method,
      buildHeaders(options?.headers, hasBody),
      body,
      options?.signal
    );

    if (response.status === 401) {
      await refreshOnce();
      const retryResponse = await fetchRequest(
        url,
        method,
        buildHeaders(options?.headers, hasBody),
        body,
        options?.signal
      );
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
