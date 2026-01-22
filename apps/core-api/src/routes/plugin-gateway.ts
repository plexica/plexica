/**
 * Plugin Gateway Routes
 *
 * REST API endpoints for plugin-to-plugin communication (M2.3)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ServiceRegistryService, ServiceRegistration } from '../services/service-registry.service';
import { PluginApiGateway, PluginApiCallRequest } from '../services/plugin-api-gateway.service';
import { SharedDataService, SetDataOptions } from '../services/shared-data.service';
import {
  DependencyResolutionService,
  DependencyDefinition,
} from '../services/dependency-resolution.service';

// ===== Helper Functions =====

/**
 * Extract tenant slug from request headers
 * @returns tenant slug or null if not found
 */
function getTenantSlugFromHeaders(request: FastifyRequest): string | null {
  const tenantSlug = request.headers['x-tenant-slug'];
  if (!tenantSlug || typeof tenantSlug !== 'string') {
    return null;
  }
  return tenantSlug;
}

// ===== Request/Response Schemas =====

// Service registration schema
const serviceRegistrationSchema = {
  body: {
    type: 'object',
    required: ['pluginId', 'serviceName', 'version'],
    properties: {
      pluginId: { type: 'string' },
      serviceName: { type: 'string' },
      version: { type: 'string' },
      baseUrl: { type: 'string' },
      endpoints: {
        type: 'array',
        items: {
          type: 'object',
          required: ['method', 'path'],
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            path: { type: 'string' },
            description: { type: 'string' },
            permissions: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object' },
          },
        },
      },
      metadata: { type: 'object' },
    },
  },
};

// API call schema
const apiCallSchema = {
  body: {
    type: 'object',
    required: ['targetPluginId', 'targetServiceName', 'method', 'path'],
    properties: {
      targetPluginId: { type: 'string' },
      targetServiceName: { type: 'string' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      path: { type: 'string' },
      headers: { type: 'object' },
      body: {},
      query: { type: 'object' },
    },
  },
};

// Shared data schema
const sharedDataSetSchema = {
  body: {
    type: 'object',
    required: ['namespace', 'key', 'value', 'ownerId'],
    properties: {
      namespace: { type: 'string' },
      key: { type: 'string' },
      value: {},
      ownerId: { type: 'string' },
      ttl: { type: 'number' },
    },
  },
};

// Dependency registration schema
const dependenciesSchema = {
  body: {
    type: 'object',
    required: ['dependencies'],
    properties: {
      dependencies: {
        type: 'array',
        items: {
          type: 'object',
          required: ['pluginId', 'dependsOnPluginId', 'version'],
          properties: {
            pluginId: { type: 'string' },
            dependsOnPluginId: { type: 'string' },
            version: { type: 'string' },
            required: { type: 'boolean' },
          },
        },
      },
    },
  },
};

export async function pluginGatewayRoutes(
  fastify: FastifyInstance,
  serviceRegistry: ServiceRegistryService,
  apiGateway: PluginApiGateway,
  sharedData: SharedDataService,
  dependencyResolver: DependencyResolutionService
) {
  // ===== Service Registry Endpoints =====

  /**
   * POST /api/plugin-gateway/services/register
   * Register a plugin service
   */
  fastify.post<{ Body: ServiceRegistration }>(
    '/api/plugin-gateway/services/register',
    { schema: serviceRegistrationSchema },
    async (request: FastifyRequest<{ Body: ServiceRegistration }>, reply: FastifyReply) => {
      // Get tenant slug from header
      const tenantSlug = request.headers['x-tenant-slug'];
      if (!tenantSlug || typeof tenantSlug !== 'string') {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        // For now, use tenant slug directly (TODO: look up actual tenant ID)
        const registration: ServiceRegistration = {
          ...request.body,
          tenantId: tenantSlug,
        };

        const serviceId = await serviceRegistry.registerService(registration);

        reply.status(201).send({
          success: true,
          serviceId,
          message: 'Service registered successfully',
        });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to register service');
        reply.status(500).send({
          error: 'Failed to register service',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * DELETE /api/plugin-gateway/services/:pluginId/:serviceName
   * Deregister a plugin service
   */
  fastify.delete<{ Params: { pluginId: string; serviceName: string } }>(
    '/api/plugin-gateway/services/:pluginId/:serviceName',
    async (request, reply) => {
      const tenantSlug = getTenantSlugFromHeaders(request);
      if (!tenantSlug) {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        const { pluginId, serviceName } = request.params;
        await serviceRegistry.deregisterService(tenantSlug, pluginId, serviceName);

        reply.send({
          success: true,
          message: 'Service deregistered successfully',
        });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to deregister service');
        reply.status(500).send({
          error: 'Failed to deregister service',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/plugin-gateway/services/discover/:serviceName
   * Discover a service
   */
  fastify.get<{ Params: { serviceName: string } }>(
    '/api/plugin-gateway/services/discover/:serviceName',
    async (request, reply) => {
      const tenantSlug = getTenantSlugFromHeaders(request);
      if (!tenantSlug) {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        const { serviceName } = request.params;
        const service = await serviceRegistry.discoverService(tenantSlug, serviceName);

        if (!service) {
          return reply.status(404).send({
            error: 'Service not found',
            serviceName,
          });
        }

        reply.send({ service });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to discover service');
        reply.status(500).send({
          error: 'Failed to discover service',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/plugin-gateway/services
   * List all services for tenant
   */
  fastify.get<{ Querystring: { pluginId?: string; status?: string } }>(
    '/api/plugin-gateway/services',
    async (request, reply) => {
      const tenantSlug = getTenantSlugFromHeaders(request);
      if (!tenantSlug) {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        const { pluginId, status } = request.query;
        const services = await serviceRegistry.listServices(tenantSlug, {
          pluginId,
          status: status as any,
        });

        reply.send({ services, count: services.length });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to list services');
        reply.status(500).send({
          error: 'Failed to list services',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/plugin-gateway/services/:serviceId/heartbeat
   * Record service heartbeat
   */
  fastify.post<{ Params: { serviceId: string } }>(
    '/api/plugin-gateway/services/:serviceId/heartbeat',
    async (request, reply) => {
      const tenantSlug = getTenantSlugFromHeaders(request);
      if (!tenantSlug) {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        // For now, just return success
        // TODO: Get pluginId and serviceName from serviceId
        reply.send({ success: true, message: 'Heartbeat received' });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to process heartbeat');
        reply.status(500).send({
          error: 'Failed to process heartbeat',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ===== API Gateway Endpoints =====

  /**
   * POST /api/plugin-gateway/call
   * Call another plugin's API
   */
  fastify.post<{ Body: PluginApiCallRequest & { callerPluginId: string } }>(
    '/api/plugin-gateway/call',
    { schema: apiCallSchema },
    async (request, reply) => {
      const tenantSlug = getTenantSlugFromHeaders(request);
      if (!tenantSlug) {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        const { callerPluginId, ...apiRequest } = request.body;

        if (!callerPluginId) {
          return reply.status(400).send({ error: 'callerPluginId is required' });
        }

        const response = await apiGateway.callPluginApi(callerPluginId, tenantSlug, apiRequest);

        // Return the response as-is (including original status code)
        reply.status(response.status).send(response);
      } catch (error) {
        fastify.log.error({ error }, 'Plugin API call failed');
        reply.status(500).send({
          error: 'Plugin API call failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ===== Shared Data Endpoints =====

  /**
   * POST /api/plugin-gateway/shared-data
   * Set shared data
   */
  fastify.post<{
    Body: { namespace: string; key: string; value: any; ownerId: string; ttl?: number };
  }>('/api/plugin-gateway/shared-data', { schema: sharedDataSetSchema }, async (request, reply) => {
    const tenantSlug = getTenantSlugFromHeaders(request);
    if (!tenantSlug) {
      return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
    }

    try {
      const { namespace, key, value, ownerId, ttl } = request.body;
      const options: SetDataOptions = ttl ? { ttl } : {};

      await sharedData.set(tenantSlug, namespace, key, value, ownerId, options);

      reply.status(201).send({ success: true, message: 'Data stored successfully' });
    } catch (error) {
      fastify.log.error({ error }, 'Failed to set shared data');
      reply.status(500).send({
        error: 'Failed to set shared data',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/plugin-gateway/shared-data/:namespace/:key
   * Get shared data
   */
  fastify.get<{ Params: { namespace: string; key: string } }>(
    '/api/plugin-gateway/shared-data/:namespace/:key',
    async (request, reply) => {
      const tenantSlug = getTenantSlugFromHeaders(request);
      if (!tenantSlug) {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        const { namespace, key } = request.params;
        const value = await sharedData.get(tenantSlug, namespace, key);

        if (value === null) {
          return reply.status(404).send({ error: 'Data not found' });
        }

        reply.send({ namespace, key, value });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to get shared data');
        reply.status(500).send({
          error: 'Failed to get shared data',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * DELETE /api/plugin-gateway/shared-data/:namespace/:key
   * Delete shared data
   */
  fastify.delete<{ Params: { namespace: string; key: string } }>(
    '/api/plugin-gateway/shared-data/:namespace/:key',
    async (request, reply) => {
      const tenantSlug = getTenantSlugFromHeaders(request);
      if (!tenantSlug) {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        const { namespace, key } = request.params;
        const deleted = await sharedData.delete(tenantSlug, namespace, key);

        if (!deleted) {
          return reply.status(404).send({ error: 'Data not found' });
        }

        reply.send({ success: true, message: 'Data deleted successfully' });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to delete shared data');
        reply.status(500).send({
          error: 'Failed to delete shared data',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/plugin-gateway/shared-data/:namespace
   * List keys in namespace
   */
  fastify.get<{ Params: { namespace: string }; Querystring: { ownerId?: string } }>(
    '/api/plugin-gateway/shared-data/:namespace',
    async (request, reply) => {
      const tenantSlug = getTenantSlugFromHeaders(request);
      if (!tenantSlug) {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        const { namespace } = request.params;
        const { ownerId } = request.query;

        const keys = await sharedData.listKeys(tenantSlug, namespace, { ownerId });

        reply.send({ namespace, keys, count: keys.length });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to list keys');
        reply.status(500).send({
          error: 'Failed to list keys',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ===== Dependency Resolution Endpoints =====

  /**
   * POST /api/plugin-gateway/dependencies
   * Register plugin dependencies
   */
  fastify.post<{ Body: { dependencies: DependencyDefinition[] } }>(
    '/api/plugin-gateway/dependencies',
    { schema: dependenciesSchema },
    async (request, reply) => {
      try {
        const { dependencies } = request.body;
        await dependencyResolver.registerDependencies(dependencies);

        reply.status(201).send({ success: true, message: 'Dependencies registered' });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to register dependencies');
        reply.status(500).send({
          error: 'Failed to register dependencies',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/plugin-gateway/dependencies/:pluginId/resolve
   * Resolve plugin dependencies
   */
  fastify.post<{ Params: { pluginId: string } }>(
    '/api/plugin-gateway/dependencies/:pluginId/resolve',
    async (request, reply) => {
      const tenantSlug = getTenantSlugFromHeaders(request);
      if (!tenantSlug) {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        const { pluginId } = request.params;
        const result = await dependencyResolver.resolveDependencies(pluginId, tenantSlug);

        if (!result.valid) {
          return reply.status(400).send({
            valid: false,
            errors: result.errors,
            warnings: result.warnings,
          });
        }

        reply.send(result);
      } catch (error) {
        fastify.log.error({ error }, 'Failed to resolve dependencies');
        reply.status(500).send({
          error: 'Failed to resolve dependencies',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/plugin-gateway/dependencies/:pluginId
   * Get plugin dependencies
   */
  fastify.get<{ Params: { pluginId: string }; Querystring: { recursive?: string } }>(
    '/api/plugin-gateway/dependencies/:pluginId',
    async (request, reply) => {
      try {
        const { pluginId } = request.params;
        const recursive = request.query.recursive === 'true';

        const dependencies = await dependencyResolver.getDependencies(pluginId, recursive);

        reply.send({ pluginId, dependencies, count: dependencies.length });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to get dependencies');
        reply.status(500).send({
          error: 'Failed to get dependencies',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/plugin-gateway/dependencies/:pluginId/dependents
   * Get plugins that depend on this plugin
   */
  fastify.get<{ Params: { pluginId: string } }>(
    '/api/plugin-gateway/dependencies/:pluginId/dependents',
    async (request, reply) => {
      try {
        const { pluginId } = request.params;
        const dependents = await dependencyResolver.getDependents(pluginId);

        reply.send({ pluginId, dependents, count: dependents.length });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to get dependents');
        reply.status(500).send({
          error: 'Failed to get dependents',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/plugin-gateway/dependencies/:pluginId/can-uninstall
   * Check if plugin can be safely uninstalled
   */
  fastify.post<{ Params: { pluginId: string } }>(
    '/api/plugin-gateway/dependencies/:pluginId/can-uninstall',
    async (request, reply) => {
      const tenantSlug = getTenantSlugFromHeaders(request);
      if (!tenantSlug) {
        return reply.status(401).send({ error: 'X-Tenant-Slug header required' });
      }

      try {
        const { pluginId } = request.params;
        const result = await dependencyResolver.canUninstall(pluginId, tenantSlug);

        reply.send(result);
      } catch (error) {
        fastify.log.error({ error }, 'Failed to check uninstall');
        reply.status(500).send({
          error: 'Failed to check uninstall',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
