import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tenantService, type CreateTenantInput, type UpdateTenantInput } from '../services/tenant.service.js';
import { TenantStatus } from '@prisma/client';
import { requireSuperAdmin } from '../middleware/auth.js';

// Request schemas
const createTenantSchema = {
  body: {
    type: 'object',
    required: ['slug', 'name'],
    properties: {
      slug: {
        type: 'string',
        pattern: '^[a-z0-9-]+$',
        minLength: 3,
        maxLength: 50,
        description: 'Unique tenant identifier (lowercase, alphanumeric, and hyphens only)',
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        description: 'Tenant display name',
      },
      settings: {
        type: 'object',
        description: 'Tenant-specific settings',
      },
      theme: {
        type: 'object',
        description: 'Tenant theme configuration',
      },
    },
  },
};

const updateTenantSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
      },
      status: {
        type: 'string',
        enum: ['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED'],
      },
      settings: {
        type: 'object',
      },
      theme: {
        type: 'object',
      },
    },
  },
};

const tenantParamsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

const listTenantsSchema = {
  querystring: {
    type: 'object',
    properties: {
      skip: {
        type: 'number',
        minimum: 0,
        default: 0,
      },
      take: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 50,
      },
      status: {
        type: 'string',
        enum: ['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED'],
      },
    },
  },
};

const installPluginSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['pluginId'],
    properties: {
      pluginId: { type: 'string' },
      configuration: {
        type: 'object',
        default: {},
      },
    },
  },
};

const uninstallPluginSchema = {
  params: {
    type: 'object',
    required: ['id', 'pluginId'],
    properties: {
      id: { type: 'string' },
      pluginId: { type: 'string' },
    },
  },
};

export async function tenantRoutes(fastify: FastifyInstance) {
  // Create a new tenant
  fastify.post<{
    Body: CreateTenantInput;
  }>(
    '/tenants',
    {
      schema: {
        description: 'Create a new tenant with full provisioning',
        tags: ['tenants'],
        ...createTenantSchema,
        response: {
          201: {
            description: 'Tenant created successfully',
            type: 'object',
            properties: {
              id: { type: 'string' },
              slug: { type: 'string' },
              name: { type: 'string' },
              status: { type: 'string' },
              settings: { type: 'object' },
              theme: { type: 'object' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          400: {
            description: 'Bad request',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateTenantInput }>, reply: FastifyReply) => {
      try {
        const tenant = await tenantService.createTenant(request.body);
        return reply.code(201).send(tenant);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );

  // List all tenants
  fastify.get(
    '/tenants',
    {
      schema: {
        description: 'List all tenants with pagination',
        tags: ['tenants'],
        ...listTenantsSchema,
        response: {
          200: {
            description: 'List of tenants',
            type: 'object',
            properties: {
              tenants: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    slug: { type: 'string' },
                    name: { type: 'string' },
                    status: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              total: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{
      Querystring: { skip?: number; take?: number; status?: TenantStatus };
    }>, reply: FastifyReply) => {
      try {
        const result = await tenantService.listTenants(request.query);
        return reply.send(result);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({ error: error.message });
      }
    }
  );

  // Get tenant by ID
  fastify.get<{
    Params: { id: string };
  }>(
    '/tenants/:id',
    {
      schema: {
        description: 'Get tenant details by ID',
        tags: ['tenants'],
        ...tenantParamsSchema,
        response: {
          200: {
            description: 'Tenant details',
            type: 'object',
            properties: {
              id: { type: 'string' },
              slug: { type: 'string' },
              name: { type: 'string' },
              status: { type: 'string' },
              settings: { type: 'object' },
              theme: { type: 'object' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
              plugins: {
                type: 'array',
                items: { type: 'object' },
              },
            },
          },
          404: {
            description: 'Tenant not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const tenant = await tenantService.getTenant(request.params.id);
        return reply.send(tenant);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(404).send({ error: error.message });
      }
    }
  );

  // Update tenant
  fastify.patch<{
    Params: { id: string };
    Body: UpdateTenantInput;
  }>(
    '/tenants/:id',
    {
      preHandler: requireSuperAdmin,
      schema: {
        description: 'Update tenant information',
        tags: ['tenants'],
        ...updateTenantSchema,
        response: {
          200: {
            description: 'Tenant updated successfully',
            type: 'object',
            properties: {
              id: { type: 'string' },
              slug: { type: 'string' },
              name: { type: 'string' },
              status: { type: 'string' },
              settings: { type: 'object' },
              theme: { type: 'object' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          404: {
            description: 'Tenant not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateTenantInput }>,
      reply: FastifyReply
    ) => {
      try {
        const tenant = await tenantService.updateTenant(request.params.id, request.body);
        return reply.send(tenant);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(404).send({ error: error.message });
      }
    }
  );

  // Delete tenant (soft delete)
  fastify.delete<{
    Params: { id: string };
  }>(
    '/tenants/:id',
    {
      preHandler: requireSuperAdmin,
      schema: {
        description: 'Delete tenant (soft delete - marks as PENDING_DELETION)',
        tags: ['tenants'],
        ...tenantParamsSchema,
        response: {
          204: {
            description: 'Tenant deleted successfully',
            type: 'null',
          },
          404: {
            description: 'Tenant not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await tenantService.deleteTenant(request.params.id);
        return reply.code(204).send();
      } catch (error: any) {
        request.log.error(error);
        return reply.code(404).send({ error: error.message });
      }
    }
  );

  // Install plugin for tenant
  fastify.post<{
    Params: { id: string };
    Body: { pluginId: string; configuration?: Record<string, any> };
  }>(
    '/tenants/:id/plugins',
    {
      schema: {
        description: 'Install a plugin for a tenant',
        tags: ['tenants', 'plugins'],
        ...installPluginSchema,
        response: {
          201: {
            description: 'Plugin installed successfully',
            type: 'object',
            properties: {
              tenantId: { type: 'string' },
              pluginId: { type: 'string' },
              enabled: { type: 'boolean' },
              configuration: { type: 'object' },
              installedAt: { type: 'string', format: 'date-time' },
            },
          },
          400: {
            description: 'Bad request',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { pluginId: string; configuration?: Record<string, any> };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantPlugin = await tenantService.installPlugin(
          request.params.id,
          request.body.pluginId,
          request.body.configuration || {}
        );
        return reply.code(201).send(tenantPlugin);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );

  // Uninstall plugin from tenant
  fastify.delete<{
    Params: { id: string; pluginId: string };
  }>(
    '/tenants/:id/plugins/:pluginId',
    {
      schema: {
        description: 'Uninstall a plugin from a tenant',
        tags: ['tenants', 'plugins'],
        ...uninstallPluginSchema,
        response: {
          204: {
            description: 'Plugin uninstalled successfully',
            type: 'null',
          },
          404: {
            description: 'Plugin or tenant not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string; pluginId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        await tenantService.uninstallPlugin(request.params.id, request.params.pluginId);
        return reply.code(204).send();
      } catch (error: any) {
        request.log.error(error);
        return reply.code(404).send({ error: error.message });
      }
    }
  );
}
