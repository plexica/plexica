// File: packages/sdk/src/api-client.ts

/**
 * @plexica/sdk — API Client
 *
 * Typed HTTP client wrapping native `fetch` for communicating with
 * the Plexica Core API and Plugin Gateway.
 */

import type { ApiRequestOptions, ApiResponse, PluginContext } from './types.js';

/**
 * Configuration for creating an ApiClient instance.
 */
export interface ApiClientConfig {
  /** Base URL of the Core API (e.g. "http://localhost:4000") */
  baseUrl: string;
  /** Plugin context for automatic header injection */
  context: PluginContext;
  /** Default request timeout in milliseconds (default: 30000) */
  defaultTimeout?: number;
  /** Default headers applied to every request */
  defaultHeaders?: Record<string, string>;
}

/**
 * Typed HTTP client for the Plexica platform.
 *
 * Automatically injects tenant and plugin identity headers into every request.
 * Returns typed `ApiResponse<T>` — never throws on non-2xx responses.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly context: PluginContext;
  private readonly defaultTimeout: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: ApiClientConfig) {
    // Strip trailing slash from baseUrl
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.context = config.context;
    this.defaultTimeout = config.defaultTimeout ?? 30_000;
    this.defaultHeaders = config.defaultHeaders ?? {};
  }

  // -----------------------------------------------------------------------
  // Convenience methods
  // -----------------------------------------------------------------------

  async get<T = unknown>(
    path: string,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  async patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  async delete<T = unknown>(
    path: string,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  // -----------------------------------------------------------------------
  // Core request method
  // -----------------------------------------------------------------------

  async request<T = unknown>(
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const method = options.method ?? 'GET';
    const timeout = options.timeout ?? this.defaultTimeout;

    // Build URL with query parameters
    const url = this.buildUrl(path, options.params);

    // Merge headers: defaults → context injection → per-request overrides
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.defaultHeaders,
      'X-Tenant-Slug': this.context.tenantId,
      'X-Caller-Plugin-ID': this.context.pluginId,
      ...(this.context.userId ? { 'X-User-ID': this.context.userId } : {}),
      ...(this.context.workspaceId ? { 'X-Workspace-ID': this.context.workspaceId } : {}),
      ...(options.headers ?? {}),
    };

    // Build fetch init
    const init: RequestInit = {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    };

    // Execute with timeout
    try {
      const response = await this.fetchWithTimeout(url, init, timeout);
      return this.parseResponse<T>(response);
    } catch (error) {
      // Network error, timeout, or JSON parse failure
      return {
        success: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Request failed',
      };
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Build the full URL, appending query params.
   */
  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Fetch with an AbortController-based timeout.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse a fetch Response into a typed ApiResponse.
   */
  private async parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const status = response.status;

    // Try to parse JSON body
    let body: Record<string, unknown> | undefined;
    try {
      const text = await response.text();
      if (text) {
        body = JSON.parse(text) as Record<string, unknown>;
      }
    } catch {
      // Non-JSON response — treat as error if not 2xx
      if (!response.ok) {
        return {
          success: false,
          status,
          error: `HTTP ${status}`,
          message: response.statusText,
        };
      }
      return { success: true, status };
    }

    if (response.ok) {
      return {
        success: true,
        status,
        data: body as unknown as T,
        ...(body && 'total' in body ? { total: body.total as number } : {}),
      };
    }

    // Non-2xx response with JSON body
    return {
      success: false,
      status,
      error: (body?.error as string) ?? `HTTP ${status}`,
      message: (body?.message as string) ?? response.statusText,
    };
  }
}
