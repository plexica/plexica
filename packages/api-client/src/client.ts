// File: packages/api-client/src/client.ts

/**
 * Base HTTP client built on axios.
 *
 * Provides a thin, typed wrapper around axios with:
 * - Auth token injection via pluggable AuthTokenProvider
 * - Structured error handling (ApiError)
 * - Automatic 429 retry with exponential back-off
 * - Configurable base URL and timeout
 *
 * Not intended to be used directly — use TenantApiClient or AdminApiClient.
 */

import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ApiError } from './types.js';
import type {
  HttpClientConfig,
  AuthTokenProvider,
  NestedApiErrorResponse,
  RetryConfig,
} from './types.js';
import { parseRetryAfter } from './retry-after.js';

const MIN_RETRY_DELAY_MS = 1_000;
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 30_000;
const DEFAULT_RETRY_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Axios config extended with internal retry tracking.
 * The `_retryCount` field is set by the 429 interceptor and cloned per retry.
 * Using an intersection type here since axios config is opaque — the cast is
 * intentional and safe because we own the property namespace (`_retryCount`).
 */
type RetryableConfig = InternalAxiosRequestConfig & { _retryCount?: number };

export class HttpClient {
  protected readonly axios: AxiosInstance;
  protected authProvider: AuthTokenProvider | null = null;
  private readonly onRateLimited?: (retryAfter: number) => void;
  private readonly retryConfig: Required<RetryConfig>;

  constructor(config: HttpClientConfig) {
    this.onRateLimited = config.onRateLimited;
    this.retryConfig = {
      maxRetries: config.retryConfig?.maxRetries ?? DEFAULT_MAX_RETRIES,
      enabled: config.retryConfig?.enabled ?? true,
      retryMethods: config.retryConfig?.retryMethods ?? DEFAULT_RETRY_METHODS,
    };

    this.axios = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    // --- Request interceptor: attach auth token ---
    this.axios.interceptors.request.use(
      async (reqConfig: InternalAxiosRequestConfig) => {
        if (this.authProvider) {
          const token = this.authProvider.getToken();
          if (token) {
            reqConfig.headers.Authorization = `Bearer ${token}`;
          }
        }
        return reqConfig;
      },
      (error) => Promise.reject(error)
    );

    // --- Response interceptor: transform errors ---
    this.axios.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error) => {
        // Pass through cancellation errors (CanceledError from AbortSignal or axios.cancel())
        // without transforming them. CanceledError IS an AxiosError in axios v1, so we must
        // check this first before the isAxiosError branch to avoid wrapping it as ApiError.
        if (axios.isCancel(error)) {
          return Promise.reject(error);
        }

        if (axios.isAxiosError(error)) {
          const status = error.response?.status ?? 0;

          // Handle 429 — automatic retry with exponential back-off.
          // This block runs BEFORE the 401 refresh block so rate-limit responses
          // are not misrouted through the token-refresh path.
          if (status === 429) {
            const retryAfterHeader = error.response?.headers?.['retry-after'] as string | undefined;
            const retryAfterSeconds = parseRetryAfter(retryAfterHeader);

            const retryable = error.config as RetryableConfig | undefined;
            const currentCount = retryable?._retryCount ?? 0;
            const maxRetries =
              this.retryConfig.enabled === false || this.retryConfig.maxRetries === 0
                ? 0
                : this.retryConfig.maxRetries;

            // Method guard: only retry idempotent methods by default.
            // POST/PUT/PATCH/DELETE are excluded unless explicitly listed in retryMethods
            // to prevent duplicate mutations on non-idempotent requests.
            const method = (retryable?.method ?? 'GET').toUpperCase();
            const isRetryableMethod = this.retryConfig.retryMethods.includes(method);

            if (retryable && currentCount < maxRetries && isRetryableMethod) {
              // Abort-aware: do not sleep if the request was already cancelled (C-02).
              if (retryable.signal?.aborted) {
                return Promise.reject(new axios.CanceledError());
              }

              // Exponential back-off: retryAfterMs * 2^(attempt-1), capped at 30s.
              // Floor at MIN_RETRY_DELAY_MS to prevent zero-delay busy-loops when
              // retryAfter=0.
              const delayMs = Math.min(
                Math.max(retryAfterSeconds * 1000 * Math.pow(2, currentCount), MIN_RETRY_DELAY_MS),
                MAX_RETRY_DELAY_MS
              );
              retryable._retryCount = currentCount + 1;

              await new Promise<void>((resolve) => setTimeout(resolve, delayMs));

              // Abort-aware: check again after sleeping in case signal fired during backoff (C-02).
              if (retryable.signal?.aborted) {
                return Promise.reject(new axios.CanceledError());
              }

              return this.axios.request(retryable);
            }

            // Retries exhausted, disabled, or non-retryable method — notify caller then reject.
            // Wrap in try/catch so a throwing callback does not replace the ApiError (C-01).
            try {
              this.onRateLimited?.(retryAfterSeconds);
            } catch {
              // Swallow side-effect errors from the callback — the ApiError below is the
              // authoritative rejection reason.
            }

            // Unwrap the Constitution Art. 6.2 nested envelope:
            //   { error: { code, message, details } }
            const raw429 = error.response?.data as Partial<NestedApiErrorResponse> | undefined;
            const nested429 = raw429?.error;
            return Promise.reject(
              new ApiError({
                statusCode: status,
                error: nested429?.code ?? 'RATE_LIMIT_EXCEEDED',
                message:
                  nested429?.message ??
                  `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
                details: nested429?.details,
                retryAfter: retryAfterSeconds,
              })
            );
          }

          // Handle 401 — attempt token refresh, then retry once
          if (status === 401 && this.authProvider?.refreshToken) {
            try {
              const refreshed = await this.authProvider.refreshToken();
              if (refreshed && error.config) {
                // Retry the original request with the new token
                const token = this.authProvider.getToken();
                if (token) {
                  error.config.headers.Authorization = `Bearer ${token}`;
                }
                return this.axios.request(error.config);
              }
            } catch {
              // Refresh failed — fall through to onAuthFailure
            }

            // Refresh failed or not possible
            this.authProvider.onAuthFailure?.();
          }

          // Build typed ApiError — unwrap Art. 6.2 nested envelope if present,
          // otherwise fall back to flat fields (legacy / non-core-api responses).
          const rawData = error.response?.data as
            | Partial<NestedApiErrorResponse>
            | { error?: string; message?: string; details?: Record<string, unknown> }
            | undefined;
          const nested =
            rawData && typeof (rawData as Partial<NestedApiErrorResponse>).error === 'object'
              ? (rawData as Partial<NestedApiErrorResponse>).error
              : undefined;
          return Promise.reject(
            new ApiError({
              statusCode: status,
              error:
                nested?.code ??
                (rawData as { error?: string })?.error ??
                error.code ??
                'UNKNOWN_ERROR',
              message:
                nested?.message ??
                (rawData as { message?: string })?.message ??
                error.message ??
                'An unknown error occurred',
              details:
                nested?.details ?? (rawData as { details?: Record<string, unknown> })?.details,
            })
          );
        }

        // Non-axios error (should be rare)
        throw error;
      }
    );
  }

  /**
   * Set the auth token provider.
   * Call this during app initialization to wire up Keycloak / any auth system.
   */
  setAuthProvider(provider: AuthTokenProvider): void {
    this.authProvider = provider;
  }

  /**
   * Clear the auth provider (e.g. on logout).
   */
  clearAuthProvider(): void {
    this.authProvider = null;
  }

  // ---------------------------------------------------------------------------
  // HTTP verbs
  // ---------------------------------------------------------------------------

  async get<T>(url: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await this.axios.get<T>(url, { params, signal });
    return response.data;
  }

  async post<T>(url: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.axios.post<T>(url, data, { signal });
    return response.data;
  }

  async patch<T>(url: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.axios.patch<T>(url, data, { signal });
    return response.data;
  }

  async put<T>(url: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.axios.put<T>(url, data, { signal });
    return response.data;
  }

  async delete<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await this.axios.delete<T>(url, { signal });
    return response.data;
  }
}
