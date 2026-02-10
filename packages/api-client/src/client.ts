// File: packages/api-client/src/client.ts

/**
 * Base HTTP client built on axios.
 *
 * Provides a thin, typed wrapper around axios with:
 * - Auth token injection via pluggable AuthTokenProvider
 * - Structured error handling (ApiError)
 * - Configurable base URL and timeout
 *
 * Not intended to be used directly — use TenantApiClient or AdminApiClient.
 */

import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ApiError } from './types.js';
import type { HttpClientConfig, AuthTokenProvider, ApiErrorResponse } from './types.js';

const DEFAULT_TIMEOUT = 30_000;

export class HttpClient {
  protected readonly axios: AxiosInstance;
  protected authProvider: AuthTokenProvider | null = null;

  constructor(config: HttpClientConfig) {
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
        if (axios.isAxiosError(error)) {
          const status = error.response?.status ?? 0;

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

          // Build typed ApiError
          const responseData = error.response?.data as Partial<ApiErrorResponse> | undefined;
          throw new ApiError({
            statusCode: status,
            error: responseData?.error ?? error.code ?? 'UNKNOWN_ERROR',
            message: responseData?.message ?? error.message ?? 'An unknown error occurred',
            details: responseData?.details,
          });
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
