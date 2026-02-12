// File: packages/api-client/src/types.ts

/**
 * @plexica/api-client — Type definitions for API client configuration,
 * requests, and responses.
 */

import type { AxiosRequestConfig } from 'axios';

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the base HTTP client.
 */
export interface HttpClientConfig {
  /** API base URL (e.g. 'http://localhost:3000') */
  baseUrl: string;
  /** Default request timeout in milliseconds (default: 30_000) */
  timeout?: number;
  /** Additional default headers */
  headers?: Record<string, string>;
}

/**
 * Configuration for the tenant-scoped client.
 */
export interface TenantClientConfig extends HttpClientConfig {
  /** Tenant slug injected as X-Tenant-Slug header */
  tenantSlug?: string;
  /** Workspace ID injected as X-Workspace-ID header */
  workspaceId?: string;
}

/**
 * Configuration for the admin client.
 * Extends HttpClientConfig but adds no additional properties.
 * Admin client has no tenant/workspace scope.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdminClientConfig extends HttpClientConfig {}

// ---------------------------------------------------------------------------
// Auth provider
// ---------------------------------------------------------------------------

/**
 * Token provider interface.
 * The consuming app implements this to supply JWT tokens and handle refresh.
 * This keeps the client agnostic of Keycloak / any specific auth library.
 */
export interface AuthTokenProvider {
  /** Return the current access token (or null/undefined if not authenticated) */
  getToken: () => string | null | undefined;
  /**
   * Attempt to refresh the token.
   * Should return true if the token was refreshed successfully.
   * If refresh fails, the provider may redirect to login.
   */
  refreshToken?: () => Promise<boolean>;
  /** Called when a 401 is received and refresh is not possible */
  onAuthFailure?: () => void;
}

// ---------------------------------------------------------------------------
// API error
// ---------------------------------------------------------------------------

/**
 * Structured API error returned by core-api.
 */
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  /** Additional validation details */
  details?: Record<string, unknown>;
}

/**
 * Custom error class for API errors with typed response data.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: Record<string, unknown>;
  public readonly isApiError = true as const;

  constructor(response: ApiErrorResponse) {
    super(response.message);
    this.name = 'ApiError';
    this.statusCode = response.statusCode;
    this.errorCode = response.error;
    this.details = response.details;
  }

  /** True when the error represents a network failure (no response from server) */
  get isNetworkError(): boolean {
    return this.statusCode === 0;
  }

  /** True when the server returned 401 Unauthorized */
  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  /** True when the server returned 403 Forbidden */
  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  /** True when the server returned 404 Not Found */
  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  /** True when the server returned 422 Unprocessable Entity (validation) */
  get isValidationError(): boolean {
    return this.statusCode === 422;
  }
}

// ---------------------------------------------------------------------------
// Paginated response
// ---------------------------------------------------------------------------

/**
 * Standard paginated response shape from core-api.
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Request options
// ---------------------------------------------------------------------------

/**
 * Extended request options (pass-through to axios where needed).
 */
export type RequestOptions = Pick<AxiosRequestConfig, 'signal' | 'params' | 'timeout'>;
