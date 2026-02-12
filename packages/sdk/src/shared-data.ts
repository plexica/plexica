// File: packages/sdk/src/shared-data.ts

/**
 * @plexica/sdk — Shared Data Client
 *
 * Cross-plugin shared state via the Plugin Gateway REST API.
 * Data is namespaced by plugin ID automatically.
 */

import type { ApiClient } from './api-client.js';
import type { PluginContext, SetSharedDataOptions, ApiResponse } from './types.js';

/**
 * Client for reading and writing shared data in the Plexica platform.
 *
 * Data is automatically namespaced under the current plugin's ID.
 */
export class SharedDataClient {
  private readonly namespace: string;

  constructor(
    private readonly api: ApiClient,
    private readonly context: PluginContext
  ) {
    this.namespace = context.pluginId;
  }

  /**
   * Store a value under the given key.
   */
  async set<T = unknown>(
    key: string,
    value: T,
    options?: SetSharedDataOptions
  ): Promise<ApiResponse<void>> {
    const response = await this.api.post('/api/plugin-gateway/shared-data', {
      namespace: this.namespace,
      key,
      value,
      ownerId: this.context.pluginId,
      ...(options?.ttl !== undefined ? { ttl: options.ttl } : {}),
    });

    return {
      success: response.success,
      status: response.status,
      error: response.error,
      message: response.message,
    };
  }

  /**
   * Retrieve a value by key.
   * Returns `undefined` as data if the key does not exist (status 404).
   */
  async get<T = unknown>(key: string): Promise<ApiResponse<T>> {
    const response = await this.api.get<{ namespace: string; key: string; value: T }>(
      `/api/plugin-gateway/shared-data/${encodeURIComponent(this.namespace)}/${encodeURIComponent(key)}`
    );

    if (!response.success) {
      return {
        success: false,
        status: response.status,
        error: response.error,
        message: response.message,
      };
    }

    return {
      success: true,
      status: response.status,
      data: response.data?.value,
    };
  }

  /**
   * Read shared data from another plugin's namespace.
   */
  async getFromNamespace<T = unknown>(namespace: string, key: string): Promise<ApiResponse<T>> {
    const response = await this.api.get<{ namespace: string; key: string; value: T }>(
      `/api/plugin-gateway/shared-data/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`
    );

    if (!response.success) {
      return {
        success: false,
        status: response.status,
        error: response.error,
        message: response.message,
      };
    }

    return {
      success: true,
      status: response.status,
      data: response.data?.value,
    };
  }

  /**
   * Delete a value by key.
   */
  async delete(key: string): Promise<ApiResponse<void>> {
    const response = await this.api.delete(
      `/api/plugin-gateway/shared-data/${encodeURIComponent(this.namespace)}/${encodeURIComponent(key)}`
    );

    return {
      success: response.success,
      status: response.status,
      error: response.error,
      message: response.message,
    };
  }

  /**
   * List all keys in this plugin's namespace.
   */
  async listKeys(): Promise<ApiResponse<string[]>> {
    const response = await this.api.get<{ namespace: string; keys: string[]; count: number }>(
      `/api/plugin-gateway/shared-data/${encodeURIComponent(this.namespace)}`
    );

    if (!response.success) {
      return {
        success: false,
        status: response.status,
        error: response.error,
        message: response.message,
      };
    }

    return {
      success: true,
      status: response.status,
      data: response.data?.keys ?? [],
      total: response.data?.count,
    };
  }

  /**
   * List all keys in another plugin's namespace (only returns public data).
   */
  async listKeysFromNamespace(namespace: string): Promise<ApiResponse<string[]>> {
    const response = await this.api.get<{ namespace: string; keys: string[]; count: number }>(
      `/api/plugin-gateway/shared-data/${encodeURIComponent(namespace)}`
    );

    if (!response.success) {
      return {
        success: false,
        status: response.status,
        error: response.error,
        message: response.message,
      };
    }

    return {
      success: true,
      status: response.status,
      data: response.data?.keys ?? [],
      total: response.data?.count,
    };
  }
}
