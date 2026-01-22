/**
 * Service Registry Service
 *
 * Manages plugin service registration, discovery, and health monitoring
 * for plugin-to-plugin communication (M2.3)
 */

import { PrismaClient, ServiceStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { FastifyBaseLogger } from 'fastify';

// Service registration data
export interface ServiceRegistration {
  pluginId: string;
  tenantId: string;
  serviceName: string;
  version: string;
  baseUrl?: string;
  endpoints?: ServiceEndpoint[];
  metadata?: Record<string, any>;
}

// Service endpoint definition
export interface ServiceEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description?: string;
  permissions?: string[];
  metadata?: Record<string, any>;
}

// Type guard for HTTP methods
function isValidHttpMethod(value: unknown): value is 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
  return typeof value === 'string' && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(value);
}

// Service discovery result
export interface DiscoveredService {
  id: string;
  pluginId: string;
  serviceName: string;
  version: string;
  baseUrl?: string;
  status: ServiceStatus;
  endpoints: ServiceEndpoint[];
  metadata: Record<string, any>;
  lastSeenAt: Date;
}

export class ServiceRegistryService {
  private readonly CACHE_PREFIX = 'service:registry:';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly logger: FastifyBaseLogger
  ) {}

  /**
   * Register a plugin service
   */
  async registerService(registration: ServiceRegistration): Promise<string> {
    this.logger.info(
      {
        pluginId: registration.pluginId,
        tenantId: registration.tenantId,
        serviceName: registration.serviceName,
      },
      'Registering plugin service'
    );

    try {
      // Create or update service
      const service = await this.prisma.pluginService.upsert({
        where: {
          tenantId_pluginId_serviceName: {
            tenantId: registration.tenantId,
            pluginId: registration.pluginId,
            serviceName: registration.serviceName,
          },
        },
        create: {
          pluginId: registration.pluginId,
          tenantId: registration.tenantId,
          serviceName: registration.serviceName,
          version: registration.version,
          baseUrl: registration.baseUrl,
          status: ServiceStatus.HEALTHY,
          metadata: registration.metadata || {},
          lastSeenAt: new Date(),
        },
        update: {
          version: registration.version,
          baseUrl: registration.baseUrl,
          status: ServiceStatus.HEALTHY,
          metadata: registration.metadata || {},
          lastSeenAt: new Date(),
        },
      });

      // Register endpoints
      if (registration.endpoints && registration.endpoints.length > 0) {
        // Delete old endpoints
        await this.prisma.pluginServiceEndpoint.deleteMany({
          where: { serviceId: service.id },
        });

        // Create new endpoints
        await this.prisma.pluginServiceEndpoint.createMany({
          data: registration.endpoints.map((endpoint) => ({
            serviceId: service.id,
            method: endpoint.method,
            path: endpoint.path,
            description: endpoint.description,
            permissions: endpoint.permissions || [],
            metadata: endpoint.metadata || {},
          })),
        });
      }

      // Invalidate cache
      await this.invalidateCache(registration.tenantId, registration.serviceName);

      this.logger.info({ serviceId: service.id }, 'Service registered successfully');
      return service.id;
    } catch (error) {
      this.logger.error({ error, registration }, 'Failed to register service');
      throw new Error(
        `Failed to register service: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Deregister a plugin service
   */
  async deregisterService(tenantId: string, pluginId: string, serviceName: string): Promise<void> {
    this.logger.info({ tenantId, pluginId, serviceName }, 'Deregistering plugin service');

    try {
      await this.prisma.pluginService.deleteMany({
        where: {
          tenantId,
          pluginId,
          serviceName,
        },
      });

      // Invalidate cache
      await this.invalidateCache(tenantId, serviceName);

      this.logger.info('Service deregistered successfully');
    } catch (error) {
      this.logger.error({ error, tenantId, pluginId, serviceName }, 'Failed to deregister service');
      throw new Error(
        `Failed to deregister service: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Discover a service by name
   */
  async discoverService(tenantId: string, serviceName: string): Promise<DiscoveredService | null> {
    // Try cache first
    const cached = await this.getFromCache(tenantId, serviceName);
    if (cached) {
      return cached;
    }

    // Query database
    const service = await this.prisma.pluginService.findFirst({
      where: {
        tenantId,
        serviceName,
        status: { in: [ServiceStatus.HEALTHY, ServiceStatus.DEGRADED] },
      },
      include: {
        endpoints: true,
      },
      orderBy: {
        lastSeenAt: 'desc', // Prefer most recently seen
      },
    });

    if (!service) {
      return null;
    }

    const discovered: DiscoveredService = {
      id: service.id,
      pluginId: service.pluginId,
      serviceName: service.serviceName,
      version: service.version,
      baseUrl: service.baseUrl || undefined,
      status: service.status,
      endpoints: service.endpoints.map((endpoint) => {
        // Validate HTTP method with type guard
        if (!isValidHttpMethod(endpoint.method)) {
          throw new Error(`Invalid HTTP method: ${endpoint.method}`);
        }
        return {
          method: endpoint.method,
          path: endpoint.path,
          description: endpoint.description || undefined,
          permissions: (endpoint.permissions as string[]) || [],
          metadata: (endpoint.metadata as Record<string, any>) || {},
        };
      }),
      metadata: (service.metadata as Record<string, any>) || {},
      lastSeenAt: service.lastSeenAt,
    };

    // Cache result
    await this.setCache(tenantId, serviceName, discovered);

    return discovered;
  }

  /**
   * List all services for a tenant
   */
  async listServices(
    tenantId: string,
    options?: {
      pluginId?: string;
      status?: ServiceStatus;
    }
  ): Promise<DiscoveredService[]> {
    const services = await this.prisma.pluginService.findMany({
      where: {
        tenantId,
        ...(options?.pluginId && { pluginId: options.pluginId }),
        ...(options?.status && { status: options.status }),
      },
      include: {
        endpoints: true,
      },
      orderBy: {
        serviceName: 'asc',
      },
    });

    return services.map((service) => ({
      id: service.id,
      pluginId: service.pluginId,
      serviceName: service.serviceName,
      version: service.version,
      baseUrl: service.baseUrl || undefined,
      status: service.status,
      endpoints: service.endpoints.map((endpoint) => {
        // Validate HTTP method with type guard
        if (!isValidHttpMethod(endpoint.method)) {
          throw new Error(`Invalid HTTP method: ${endpoint.method}`);
        }
        return {
          method: endpoint.method,
          path: endpoint.path,
          description: endpoint.description || undefined,
          permissions: (endpoint.permissions as string[]) || [],
          metadata: (endpoint.metadata as Record<string, any>) || {},
        };
      }),
      metadata: (service.metadata as Record<string, any>) || {},
      lastSeenAt: service.lastSeenAt,
    }));
  }

  /**
   * Update service health status
   */
  async updateServiceHealth(serviceId: string, status: ServiceStatus): Promise<void> {
    await this.prisma.pluginService.update({
      where: { id: serviceId },
      data: {
        status,
        lastSeenAt: new Date(),
      },
    });

    // Get service details to invalidate cache
    const service = await this.prisma.pluginService.findUnique({
      where: { id: serviceId },
      select: { tenantId: true, serviceName: true },
    });

    if (service) {
      await this.invalidateCache(service.tenantId, service.serviceName);
    }
  }

  /**
   * Heartbeat - update last seen timestamp
   */
  async heartbeat(tenantId: string, pluginId: string, serviceName: string): Promise<void> {
    await this.prisma.pluginService.updateMany({
      where: {
        tenantId,
        pluginId,
        serviceName,
      },
      data: {
        lastSeenAt: new Date(),
      },
    });
  }

  /**
   * Mark stale services as unavailable (older than 5 minutes)
   */
  async markStaleServices(): Promise<number> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const result = await this.prisma.pluginService.updateMany({
      where: {
        lastSeenAt: { lt: fiveMinutesAgo },
        status: { not: ServiceStatus.UNAVAILABLE },
      },
      data: {
        status: ServiceStatus.UNAVAILABLE,
      },
    });

    if (result.count > 0) {
      this.logger.warn({ count: result.count }, 'Marked stale services as unavailable');
    }

    return result.count;
  }

  // ===== Cache Helpers =====

  private getCacheKey(tenantId: string, serviceName: string): string {
    return `${this.CACHE_PREFIX}${tenantId}:${serviceName}`;
  }

  private async getFromCache(
    tenantId: string,
    serviceName: string
  ): Promise<DiscoveredService | null> {
    try {
      const key = this.getCacheKey(tenantId, serviceName);
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn({ error }, 'Failed to get from cache');
    }
    return null;
  }

  private async setCache(
    tenantId: string,
    serviceName: string,
    service: DiscoveredService
  ): Promise<void> {
    try {
      const key = this.getCacheKey(tenantId, serviceName);
      await this.redis.setex(key, this.CACHE_TTL, JSON.stringify(service));
    } catch (error) {
      this.logger.warn({ error }, 'Failed to set cache');
    }
  }

  private async invalidateCache(tenantId: string, serviceName: string): Promise<void> {
    try {
      const key = this.getCacheKey(tenantId, serviceName);
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn({ error }, 'Failed to invalidate cache');
    }
  }
}
