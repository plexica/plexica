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
 * Configuration for 429 auto-retry behaviour.
 */
export interface RetryConfig {
  /** Maximum number of automatic retries for 429 responses (default: 2) */
  maxRetries?: number;
  /** Whether 429 auto-retry is enabled (default: true) */
  enabled?: boolean;
  /**
   * HTTP methods eligible for automatic retry on 429 responses.
   * Defaults to ['GET', 'HEAD', 'OPTIONS'] to prevent duplicate mutations on
   * non-idempotent requests (POST, PUT, PATCH, DELETE).
   *
   * NOTE: Plexica's @fastify/rate-limit is a pre-handler guard — it rejects
   * requests before any state change occurs, so all methods are effectively safe
   * on Plexica's core-api. The conservative default protects against non-Plexica
   * backends where a 429 may be emitted after partial execution.
   *
   * Override to include POST/PUT/PATCH/DELETE only when you have confirmed that
   * the target backend is idempotent or uses a pre-handler rate-limit guard.
   */
  retryMethods?: string[];
}

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
  /**
   * Called when a 429 response is received after all retries are exhausted.
   * Use this to show a user-facing toast/banner with the retry wait time.
   */
  onRateLimited?: (retryAfter: number) => void;
  /** Configuration for automatic 429 retry with exponential back-off */
  retryConfig?: RetryConfig;
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
 *
 * core-api always uses the Constitution Art. 6.2 nested envelope:
 *   { error: { code, message, details } }
 *
 * The top-level `statusCode`, `error` (string), `message`, and `details`
 * fields below model the normalised view after the client unwraps the
 * envelope. `NestedApiErrorResponse` models the raw wire format.
 */
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  /** Additional validation details */
  details?: Record<string, unknown>;
  /**
   * Seconds until the client should retry (populated on 429 responses).
   * Null when not a rate-limit error.
   */
  retryAfter?: number | null;
}

/**
 * Raw wire format for Constitution Art. 6.2 nested error envelope.
 *
 * ```json
 * { "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "...", "details": {} } }
 * ```
 *
 * The client normalises this into `ApiErrorResponse` before constructing `ApiError`.
 */
export interface NestedApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Custom error class for API errors with typed response data.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: Record<string, unknown>;
  public readonly isApiError = true as const;
  /** Seconds until the client should retry (populated on 429 responses, null otherwise) */
  public readonly retryAfter: number | null;

  constructor(response: ApiErrorResponse) {
    super(response.message);
    this.name = 'ApiError';
    this.statusCode = response.statusCode;
    this.errorCode = response.error;
    this.details = response.details;
    this.retryAfter = response.retryAfter ?? null;
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

  /** True when the server returned 429 Too Many Requests */
  get isRateLimited(): boolean {
    return this.statusCode === 429;
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
