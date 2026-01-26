import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tenantService } from '../services/tenant.service.js';
import { analyticsService } from '../services/analytics.service.js';
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

        // Get tenants from service (with database-level search)
        const result = await tenantService.listTenants({
          skip,
          take,
          status,
          search,
        });

        const totalPages = Math.ceil(result.total / limit);

        return reply.send({
          tenants: result.tenants,
          total: result.total,
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

  // Create a new tenant (with full provisioning)
  fastify.post<{
    Body: {
      slug: string;
      name: string;
      settings?: Record<string, any>;
      theme?: Record<string, any>;
    };
  }>(
    '/admin/tenants',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Create a new tenant with full provisioning (super-admin only)',
        tags: ['admin', 'tenants'],
        body: {
          type: 'object',
          required: ['slug', 'name'],
          properties: {
            slug: {
              type: 'string',
              pattern: '^[a-z0-9-]{1,50}$',
              description: 'Unique tenant slug (lowercase alphanumeric with hyphens)',
              examples: ['acme-corp', 'globex-inc'],
            },
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 255,
              description: 'Tenant display name',
              examples: ['Acme Corporation', 'Globex Inc'],
            },
            settings: {
              type: 'object',
              description: 'Optional tenant settings (JSON object)',
              default: {},
            },
            theme: {
              type: 'object',
              description: 'Optional tenant theme configuration (JSON object)',
              default: {},
            },
          },
        },
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
            description: 'Invalid input or validation error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          409: {
            description: 'Tenant with this slug already exists',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          500: {
            description: 'Provisioning failed',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          slug: string;
          name: string;
          settings?: Record<string, any>;
          theme?: Record<string, any>;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { slug, name, settings, theme } = request.body;

        // Create tenant with full provisioning
        // This will:
        // 1. Create tenant record in database (status: PROVISIONING)
        // 2. Create PostgreSQL schema for tenant
        // 3. Create Keycloak realm for authentication
        // 4. Initialize default roles and permissions
        // 5. Update status to ACTIVE (or SUSPENDED if provisioning fails)
        const tenant = await tenantService.createTenant({
          slug,
          name,
          settings,
          theme,
        });

        request.log.info({ tenantId: tenant.id, slug: tenant.slug }, 'Tenant created successfully');

        return reply.code(201).send(tenant);
      } catch (error: any) {
        request.log.error({ error, body: request.body }, 'Failed to create tenant');

        // Handle validation errors
        if (error.message.includes('must be')) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }

        // Handle duplicate slug errors
        if (error.message.includes('already exists')) {
          return reply.code(409).send({
            error: 'Conflict',
            message: error.message,
          });
        }

        // Handle provisioning errors
        if (error.message.includes('Failed to provision')) {
          return reply.code(500).send({
            error: 'Provisioning Failed',
            message: error.message,
          });
        }

        // Generic server error
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create tenant',
        });
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
        request.log.error({ error, tenantId: request.params.id }, 'Failed to get tenant');

        if (error.message === 'Tenant not found') {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve tenant details',
        });
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
        request.log.error({ error, tenantId: request.params.id }, 'Failed to suspend tenant');

        if (error.message === 'Tenant not found') {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to suspend tenant',
        });
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
        request.log.error({ error, tenantId: request.params.id }, 'Failed to activate tenant');

        if (error.message === 'Tenant not found') {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to activate tenant',
        });
      }
    }
  );

  // Delete tenant (soft delete - marks as PENDING_DELETION)
  fastify.delete<{
    Params: { id: string };
  }>(
    '/admin/tenants/:id',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Delete a tenant (soft delete - marks as PENDING_DELETION)',
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
            description: 'Tenant marked for deletion',
            type: 'object',
            properties: {
              message: { type: 'string' },
              tenantId: { type: 'string' },
            },
          },
          404: {
            description: 'Tenant not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await tenantService.deleteTenant(request.params.id);

        request.log.info({ tenantId: request.params.id }, 'Tenant marked for deletion');

        return reply.send({
          message: 'Tenant marked for deletion',
          tenantId: request.params.id,
        });
      } catch (error: any) {
        request.log.error({ error, tenantId: request.params.id }, 'Failed to delete tenant');

        if (error.message === 'Tenant not found') {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete tenant',
        });
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

  // Platform-wide overview statistics
  fastify.get(
    '/admin/analytics/overview',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Get platform-wide overview statistics (super-admin only)',
        tags: ['admin', 'analytics'],
        response: {
          200: {
            description: 'Platform statistics',
            type: 'object',
            properties: {
              totalTenants: { type: 'number' },
              activeTenants: { type: 'number' },
              suspendedTenants: { type: 'number' },
              provisioningTenants: { type: 'number' },
              totalPlugins: { type: 'number' },
              totalPluginInstallations: { type: 'number' },
              totalUsers: { type: 'number' },
              totalWorkspaces: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const overview = await analyticsService.getOverview();
        return reply.send(overview);
      } catch (error: any) {
        request.log.error({ error }, 'Failed to fetch analytics overview');
        return (reply as any).code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch analytics overview',
        });
      }
    }
  );

  // Tenant growth over time
  fastify.get<{
    Querystring: {
      days?: number;
    };
  }>(
    '/admin/analytics/tenants',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Get tenant growth statistics over time (super-admin only)',
        tags: ['admin', 'analytics'],
        querystring: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              minimum: 1,
              maximum: 365,
              default: 30,
              description: 'Number of days to look back',
            },
          },
        },
        response: {
          200: {
            description: 'Tenant growth data',
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string', format: 'date' },
                    totalTenants: { type: 'number' },
                    activeTenants: { type: 'number' },
                    newTenants: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { days = 30 } = request.query;
        const data = await analyticsService.getTenantGrowth(days);
        return reply.send({ data });
      } catch (error: any) {
        request.log.error({ error }, 'Failed to fetch tenant growth data');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch tenant growth data',
        });
      }
    }
  );

  // Plugin usage statistics
  fastify.get(
    '/admin/analytics/plugins',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Get plugin usage statistics (super-admin only)',
        tags: ['admin', 'analytics'],
        response: {
          200: {
            description: 'Plugin usage data',
            type: 'object',
            properties: {
              plugins: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    pluginId: { type: 'string' },
                    pluginName: { type: 'string' },
                    version: { type: 'string' },
                    totalInstallations: { type: 'number' },
                    activeTenants: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const plugins = await analyticsService.getPluginUsage();
        return reply.send({ plugins });
      } catch (error: any) {
        request.log.error({ error }, 'Failed to fetch plugin usage data');
        return (reply as any).code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch plugin usage data',
        });
      }
    }
  );

  // API call metrics
  fastify.get<{
    Querystring: {
      hours?: number;
    };
  }>(
    '/admin/analytics/api-calls',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Get API call metrics over time (super-admin only)',
        tags: ['admin', 'analytics'],
        querystring: {
          type: 'object',
          properties: {
            hours: {
              type: 'number',
              minimum: 1,
              maximum: 168,
              default: 24,
              description: 'Number of hours to look back (max 7 days)',
            },
          },
        },
        response: {
          200: {
            description: 'API call metrics',
            type: 'object',
            properties: {
              metrics: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    period: { type: 'string', format: 'date-time' },
                    totalCalls: { type: 'number' },
                    successfulCalls: { type: 'number' },
                    failedCalls: { type: 'number' },
                    averageResponseTime: { type: 'number' },
                  },
                },
              },
              note: {
                type: 'string',
                description: 'Implementation status note',
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { hours = 24 } = request.query;
        const metrics = await analyticsService.getApiCallMetrics(hours);
        return reply.send({
          metrics,
          note: 'API metrics collection not yet implemented - showing placeholder data',
        });
      } catch (error: any) {
        request.log.error({ error }, 'Failed to fetch API call metrics');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch API call metrics',
        });
      }
    }
  );
}
