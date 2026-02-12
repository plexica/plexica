// File: packages/sdk/src/service-client.ts

/**
 * @plexica/sdk — Service Client
 *
 * Helpers for registering, discovering, and calling plugin services
 * via the Plugin Gateway REST API.
 */

import type { ApiClient } from './api-client.js';
import type {
  PluginContext,
  ServiceDefinition,
  DiscoveredService,
  PluginApiCallRequest,
  ApiResponse,
} from './types.js';

/**
 * Client for interacting with the Plexica Service Registry and API Gateway.
 */
export class ServiceClient {
  constructor(
    private readonly api: ApiClient,
    private readonly context: PluginContext
  ) {}

  // -----------------------------------------------------------------------
  // Service Registration
  // -----------------------------------------------------------------------

  /**
   * Register one or more services with the gateway.
   * Returns an array of service IDs on success.
   */
  async registerServices(
    services: ServiceDefinition[]
  ): Promise<ApiResponse<{ serviceId: string }[]>> {
    const results: { serviceId: string }[] = [];

    for (const service of services) {
      const response = await this.api.post<{ success: boolean; serviceId: string }>(
        '/api/plugin-gateway/services/register',
        {
          pluginId: this.context.pluginId,
          serviceName: service.name,
          version: service.version,
          baseUrl: service.baseUrl,
          endpoints: service.endpoints,
          metadata: service.metadata,
        }
      );

      if (!response.success) {
        return {
          success: false,
          status: response.status,
          error: response.error,
          message: `Failed to register service "${service.name}": ${response.message ?? response.error}`,
        };
      }

      results.push({ serviceId: response.data?.serviceId ?? '' });
    }

    return { success: true, status: 201, data: results };
  }

  /**
   * Register a single service.
   */
  async registerService(service: ServiceDefinition): Promise<ApiResponse<{ serviceId: string }>> {
    const response = await this.api.post<{ success: boolean; serviceId: string }>(
      '/api/plugin-gateway/services/register',
      {
        pluginId: this.context.pluginId,
        serviceName: service.name,
        version: service.version,
        baseUrl: service.baseUrl,
        endpoints: service.endpoints,
        metadata: service.metadata,
      }
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
      status: 201,
      data: { serviceId: response.data?.serviceId ?? '' },
    };
  }

  /**
   * Deregister a service by name.
   */
  async deregisterService(serviceName: string): Promise<ApiResponse<void>> {
    const response = await this.api.delete(
      `/api/plugin-gateway/services/${encodeURIComponent(this.context.pluginId)}/${encodeURIComponent(serviceName)}`
    );

    return {
      success: response.success,
      status: response.status,
      error: response.error,
      message: response.message,
    };
  }

  /**
   * Deregister all services for this plugin.
   */
  async deregisterAllServices(serviceNames: string[]): Promise<void> {
    await Promise.all(serviceNames.map((name) => this.deregisterService(name)));
  }

  // -----------------------------------------------------------------------
  // Service Discovery
  // -----------------------------------------------------------------------

  /**
   * Discover a service by name. Returns the first healthy service found.
   */
  async discoverService(serviceName: string): Promise<ApiResponse<DiscoveredService>> {
    const response = await this.api.get<{ service: DiscoveredService }>(
      `/api/plugin-gateway/services/discover/${encodeURIComponent(serviceName)}`
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
      data: response.data?.service,
    };
  }

  /**
   * List all registered services, optionally filtered by plugin ID or status.
   */
  async listServices(options?: {
    pluginId?: string;
    status?: string;
  }): Promise<ApiResponse<DiscoveredService[]>> {
    const params: Record<string, string> = {};
    if (options?.pluginId) params.pluginId = options.pluginId;
    if (options?.status) params.status = options.status;

    const response = await this.api.get<{ services: DiscoveredService[]; count: number }>(
      '/api/plugin-gateway/services',
      { params }
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
      data: response.data?.services ?? [],
      total: response.data?.count,
    };
  }

  // -----------------------------------------------------------------------
  // Service Heartbeat
  // -----------------------------------------------------------------------

  /**
   * Send a heartbeat for a registered service.
   */
  async heartbeat(serviceId: string): Promise<ApiResponse<void>> {
    const response = await this.api.post(
      `/api/plugin-gateway/services/${encodeURIComponent(serviceId)}/heartbeat`
    );

    return {
      success: response.success,
      status: response.status,
      error: response.error,
      message: response.message,
    };
  }

  // -----------------------------------------------------------------------
  // Plugin-to-Plugin API Calls
  // -----------------------------------------------------------------------

  /**
   * Call another plugin's API endpoint through the gateway.
   */
  async callPluginApi<T = unknown>(request: PluginApiCallRequest): Promise<ApiResponse<T>> {
    const response = await this.api.post<T>('/api/plugin-gateway/call', {
      callerPluginId: this.context.pluginId,
      targetPluginId: request.targetPluginId,
      targetServiceName: request.serviceName,
      method: request.method,
      path: request.path,
      body: request.body,
      query: request.params,
      headers: request.headers,
    });

    return response;
  }
}
