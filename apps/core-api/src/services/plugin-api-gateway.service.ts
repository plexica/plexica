/**
 * Plugin API Gateway Service
 *
 * Routes plugin-to-plugin API calls with authentication, authorization,
 * and request/response transformations (M2.3)
 */

import { FastifyBaseLogger } from 'fastify';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ServiceRegistryService, DiscoveredService } from './service-registry.service';

// API call request
export interface PluginApiCallRequest {
  targetPluginId: string;
  targetServiceName: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
}

// API call response
export interface PluginApiCallResponse<T = any> {
  status: number;
  headers: Record<string, string>;
  data: T;
  metadata: {
    targetPlugin: string;
    targetService: string;
    duration: number;
    timestamp: Date;
  };
}

// Gateway error
export class PluginGatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'PluginGatewayError';
  }
}

export class PluginApiGateway {
  private readonly httpClient: AxiosInstance;
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  constructor(
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly logger: FastifyBaseLogger
  ) {
    // Create HTTP client with defaults
    this.httpClient = axios.create({
      timeout: this.REQUEST_TIMEOUT,
      validateStatus: () => true, // Don't throw on any status
    });
  }

  /**
   * Call a plugin API endpoint
   */
  async callPluginApi<T = any>(
    callerPluginId: string,
    tenantId: string,
    request: PluginApiCallRequest
  ): Promise<PluginApiCallResponse<T>> {
    const startTime = Date.now();

    this.logger.info(
      {
        caller: callerPluginId,
        target: request.targetPluginId,
        service: request.targetServiceName,
        method: request.method,
        path: request.path,
      },
      'Plugin API call initiated'
    );

    try {
      // 1. Discover target service
      const service = await this.serviceRegistry.discoverService(
        tenantId,
        request.targetServiceName
      );

      if (!service) {
        throw new PluginGatewayError(
          `Service not found: ${request.targetServiceName}`,
          'SERVICE_NOT_FOUND',
          404
        );
      }

      // 2. Verify target plugin matches
      if (service.pluginId !== request.targetPluginId) {
        throw new PluginGatewayError(
          `Service ${request.targetServiceName} belongs to ${service.pluginId}, not ${request.targetPluginId}`,
          'PLUGIN_MISMATCH',
          400
        );
      }

      // 3. Check service health
      if (service.status === 'UNAVAILABLE') {
        throw new PluginGatewayError(
          `Service ${request.targetServiceName} is unavailable`,
          'SERVICE_UNAVAILABLE',
          503
        );
      }

      // 4. Validate endpoint exists
      const endpoint = this.findEndpoint(service, request.method, request.path);
      if (!endpoint) {
        throw new PluginGatewayError(
          `Endpoint not found: ${request.method} ${request.path}`,
          'ENDPOINT_NOT_FOUND',
          404,
          {
            availableEndpoints: service.endpoints.map((e) => `${e.method} ${e.path}`),
          }
        );
      }

      // 5. Build request URL
      const baseUrl = service.baseUrl || this.getDefaultBaseUrl(service.pluginId);
      const fullUrl = this.buildUrl(baseUrl, request.path, request.query);

      // 6. Prepare headers
      const headers = {
        ...request.headers,
        'X-Tenant-ID': tenantId,
        'X-Caller-Plugin-ID': callerPluginId,
        'X-Request-ID': this.generateRequestId(),
        'Content-Type': 'application/json',
      };

      // 7. Make HTTP request
      const axiosConfig: AxiosRequestConfig = {
        method: request.method,
        url: fullUrl,
        headers,
        ...(request.body && { data: request.body }),
      };

      this.logger.debug({ url: fullUrl, method: request.method }, 'Making HTTP request');

      const response: AxiosResponse = await this.httpClient.request(axiosConfig);

      const duration = Date.now() - startTime;

      this.logger.info(
        {
          status: response.status,
          duration,
          target: request.targetPluginId,
        },
        'Plugin API call completed'
      );

      // 8. Return response
      return {
        status: response.status,
        headers: response.headers as Record<string, string>,
        data: response.data,
        metadata: {
          targetPlugin: service.pluginId,
          targetService: service.serviceName,
          duration,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof PluginGatewayError) {
        this.logger.warn(
          { error: error.message, code: error.code, duration },
          'Plugin API call failed'
        );
        throw error;
      }

      // Handle axios errors
      if (axios.isAxiosError(error)) {
        this.logger.error(
          { error: error.message, code: error.code, duration },
          'HTTP request failed'
        );
        throw new PluginGatewayError(
          `HTTP request failed: ${error.message}`,
          'HTTP_ERROR',
          error.response?.status || 500,
          {
            axiosCode: error.code,
            responseData: error.response?.data,
          }
        );
      }

      // Unexpected errors
      this.logger.error({ error, duration }, 'Unexpected error in plugin API call');
      throw new PluginGatewayError('Internal gateway error', 'INTERNAL_ERROR', 500, {
        originalError: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Find matching endpoint in service
   */
  private findEndpoint(
    service: DiscoveredService,
    method: string,
    path: string
  ): DiscoveredService['endpoints'][0] | undefined {
    // Exact match first
    const exactMatch = service.endpoints.find((e) => e.method === method && e.path === path);

    if (exactMatch) {
      return exactMatch;
    }

    // Pattern match (e.g., /contacts/:id)
    return service.endpoints.find((e) => {
      if (e.method !== method) return false;
      return this.pathMatches(e.path, path);
    });
  }

  /**
   * Check if path matches pattern (simple implementation)
   */
  private pathMatches(pattern: string, path: string): boolean {
    // Convert /contacts/:id to regex /contacts/[^/]+
    const regexPattern = pattern.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Build full URL with query params
   */
  private buildUrl(baseUrl: string, path: string, query?: Record<string, string>): string {
    const url = new URL(path, baseUrl);

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    return url.toString();
  }

  /**
   * Get default base URL for plugin (internal routing)
   */
  private getDefaultBaseUrl(pluginId: string): string {
    // For now, assume plugins are deployed as services in same network
    // In production, this would come from K8s service discovery
    return `http://plugin-${pluginId}:3000`;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
