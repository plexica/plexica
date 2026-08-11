// api-client.ts
// The ONE fetch pipeline for every authenticated call (Constitution Rule 3).
// JSON and multipart (FormData) requests share the same bearer injection,
// single-flight 401 refresh and session-expiry notification. Nothing may
// re-implement any part of this — that is what the removed `uploadMultipart`
// helper in apps/web did, and it silently bypassed token refresh.
//
// Error shape and response parsing live in api-error.ts and are re-exported here
// so `@plexica/auth/api-client` stays the single import surface.

import { ApiError, readErrorBody, parseResponse } from './api-error.js';

export { ApiError, NON_HTTP_STATUS, invalidResponseError } from './api-error.js';
export type { ErrorBody } from './api-error.js';

export interface ApiClientConfig {
  baseUrl?: string;
  requestTimeoutMs?: number;
  /** Uploads legitimately take longer than a JSON round-trip. */
  uploadTimeoutMs?: number;
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

export type FormRequestOptions = Omit<RequestOptions, 'body'>;

export const API_REQUEST_TIMEOUT_MS = 10_000;
export const API_UPLOAD_TIMEOUT_MS = 60_000;

interface Attempt {
  method: string;
  url: string;
  /** `undefined` for FormData: the browser must generate the multipart boundary. */
  contentType: string | undefined;
  body: string | FormData | undefined;
  timeoutMs: number;
  headers: Record<string, string> | undefined;
  signal: AbortSignal | undefined;
}

export function createApiClient(config: ApiClientConfig) {
  const {
    baseUrl = '',
    requestTimeoutMs = API_REQUEST_TIMEOUT_MS,
    uploadTimeoutMs = API_UPLOAD_TIMEOUT_MS,
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

  function buildHeaders(
    optionsHeaders: Record<string, string> | undefined,
    contentType: string | undefined
  ): Record<string, string> {
    const headers: Record<string, string> = {
      ...(extraHeaders?.() ?? {}),
      ...optionsHeaders,
    };
    if (contentType !== undefined) headers['Content-Type'] = contentType;
    const { accessToken } = getTokens();
    if (accessToken !== null) headers['Authorization'] = `Bearer ${accessToken}`;
    return headers;
  }

  function requestSignal(timeoutMs: number, callerSignal: AbortSignal | undefined): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    return callerSignal === undefined
      ? timeoutSignal
      : AbortSignal.any([callerSignal, timeoutSignal]);
  }

  // A FormData body is safe to reuse across the 401 retry: fetch re-serializes it
  // on every call (unlike a ReadableStream, which would be consumed once).
  function fetchOnce(attempt: Attempt): Promise<Response> {
    return fetch(attempt.url, {
      method: attempt.method,
      headers: buildHeaders(attempt.headers, attempt.contentType),
      signal: requestSignal(attempt.timeoutMs, attempt.signal),
      ...(attempt.body !== undefined ? { body: attempt.body } : {}),
    });
  }

  async function send<T>(attempt: Attempt): Promise<T> {
    let response = await fetchOnce(attempt);
    if (response.status === 401) {
      await refreshOnce();
      response = await fetchOnce(attempt);
      if (response.status === 401) throw expireSession();
    }
    if (!response.ok) throw new ApiError(response.status, await readErrorBody(response));
    return parseResponse<T>(response);
  }

  function request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    const hasBody = options?.body !== undefined;
    return send<T>({
      method,
      url: `${baseUrl}${path}`,
      contentType: hasBody ? 'application/json' : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      timeoutMs: requestTimeoutMs,
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  function formRequest<T>(
    method: string,
    path: string,
    form: FormData,
    options?: FormRequestOptions
  ): Promise<T> {
    return send<T>({
      method,
      url: `${baseUrl}${path}`,
      contentType: undefined,
      body: form,
      timeoutMs: uploadTimeoutMs,
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  return {
    get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
      request<T>('GET', path, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>('POST', path, { ...options, body }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>('PATCH', path, { ...options, body }),
    delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
    /** Multipart POST — same auth/refresh/session pipeline as every other call. */
    postForm: <T>(path: string, form: FormData, options?: FormRequestOptions) =>
      formRequest<T>('POST', path, form, options),
    /** Multipart PATCH — same auth/refresh/session pipeline as every other call. */
    patchForm: <T>(path: string, form: FormData, options?: FormRequestOptions) =>
      formRequest<T>('PATCH', path, form, options),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
