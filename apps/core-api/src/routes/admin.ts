import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tenantService } from '../services/tenant.service.js';
import { TenantStatus } from '@plexica/database';
import { requireSuperAdmin } from '../middleware/auth.js';

/**
 * Admin Routes for Super Admin Application
 *
 * These routes are designed for the super-admin app running on port 3002.
 * They provide platform-wide administration capabilities.
 *
 * SECURITY:
 * - All routes require super-admin role (enforced by requireSuperAdmin middleware)
 * - NO tenant context required (platform-wide access)
 * - NO X-Tenant-Slug header needed
 */

export async function adminRoutes(fastify: FastifyInstance) {
  // ===== TENANT MANAGEMENT =====

  // List all tenants (for super-admin dashboard)
  fastify.get<{
    Querystring: {
      page?: number;
      limit?: number;
      search?: string;
      status?: TenantStatus;
    };
  }>(
    '/admin/tenants',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'List all tenants with pagination and filters (super-admin only)',
        tags: ['admin', 'tenants'],
        querystring: {
          type: 'object',
          properties: {
            page: {
              type: 'number',
              minimum: 1,
              default: 1,
              description: 'Page number (1-based)',
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 100,
              default: 50,
              description: 'Items per page',
            },
            search: {
              type: 'string',
              description: 'Search by tenant name or slug',
            },
            status: {
              type: 'string',
              enum: ['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED'],
              description: 'Filter by tenant status',
            },
          },
        },
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
              page: { type: 'number' },
              limit: { type: 'number' },
              totalPages: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { page = 1, limit = 50, search, status } = request.query;

        // Calculate skip/take for pagination
        const skip = (page - 1) * limit;
        const take = limit;

        // Get tenants from service
        const result = await tenantService.listTenants({
          skip,
          take,
          status,
        });

        // Apply search filter if provided (client-side for now)
        let filteredTenants = result.tenants;
        if (search) {
          const searchLower = search.toLowerCase();
          filteredTenants = filteredTenants.filter(
            (tenant) =>
              tenant.name.toLowerCase().includes(searchLower) ||
              tenant.slug.toLowerCase().includes(searchLower)
          );
        }

        const total = search ? filteredTenants.length : result.total;
        const totalPages = Math.ceil(total / limit);

        return reply.send({
          tenants: filteredTenants,
          total,
          page,
          limit,
          totalPages,
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({ error: error.message });
      }
    }
  );

  // Get tenant by ID (admin view with full details)
  fastify.get<{
    Params: { id: string };
  }>(
    '/admin/tenants/:id',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Get tenant details by ID (super-admin only)',
        tags: ['admin', 'tenants'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
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

  // Suspend tenant
  fastify.post<{
    Params: { id: string };
  }>(
    '/admin/tenants/:id/suspend',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Suspend a tenant (super-admin only)',
        tags: ['admin', 'tenants'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Tenant suspended successfully',
            type: 'object',
            properties: {
              id: { type: 'string' },
              slug: { type: 'string' },
              name: { type: 'string' },
              status: { type: 'string' },
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
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const tenant = await tenantService.updateTenant(request.params.id, {
          status: TenantStatus.SUSPENDED,
        });
        return reply.send(tenant);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(404).send({ error: error.message });
      }
    }
  );

  // Activate tenant
  fastify.post<{
    Params: { id: string };
  }>(
    '/admin/tenants/:id/activate',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Activate a suspended tenant (super-admin only)',
        tags: ['admin', 'tenants'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Tenant activated successfully',
            type: 'object',
            properties: {
              id: { type: 'string' },
              slug: { type: 'string' },
              name: { type: 'string' },
              status: { type: 'string' },
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
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const tenant = await tenantService.updateTenant(request.params.id, {
          status: TenantStatus.ACTIVE,
        });
        return reply.send(tenant);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(404).send({ error: error.message });
      }
    }
  );

  // ===== PLUGIN MANAGEMENT (Global Registry) =====
  // TODO: Implement plugin registry endpoints when plugin service is ready
  // GET /admin/plugins - List all plugins in global registry
  // GET /admin/plugins/:id - Get plugin details
  // POST /admin/plugins - Publish new plugin to registry
  // PATCH /admin/plugins/:id - Update plugin metadata
  // POST /admin/plugins/:id/unpublish - Unpublish plugin
  // GET /admin/plugins/:id/installs - Get installation statistics

  // Placeholder for plugin registry
  fastify.get('/admin/plugins', async (_request, reply) => {
    // TODO: Implement with plugin service
    return reply.send({
      plugins: [],
      total: 0,
      message: 'Plugin registry endpoints not yet implemented',
    });
  });

  // ===== USER MANAGEMENT (Cross-Tenant) =====
  // TODO: Implement user management endpoints
  // GET /admin/users - List all users across all tenants
  // GET /admin/users/:id - Get user details
  // PATCH /admin/users/:id - Update user
  // DELETE /admin/users/:id - Delete user

  // Placeholder for user management
  fastify.get('/admin/users', async (_request, reply) => {
    // TODO: Implement with user service
    return reply.send({
      users: [],
      total: 0,
      message: 'User management endpoints not yet implemented',
    });
  });

  // ===== ANALYTICS =====
  // TODO: Implement analytics endpoints
  // GET /admin/analytics/overview - Platform-wide stats
  // GET /admin/analytics/tenants - Tenant growth over time
  // GET /admin/analytics/plugins - Plugin usage statistics
  // GET /admin/analytics/api-calls - API usage metrics

  // Placeholder for analytics
  fastify.get('/admin/analytics/overview', async (_request, reply) => {
    // TODO: Implement with analytics service
    return reply.send({
      totalTenants: 0,
      activeTenants: 0,
      totalPlugins: 0,
      totalUsers: 0,
      message: 'Analytics endpoints not yet implemented',
    });
  });
}
