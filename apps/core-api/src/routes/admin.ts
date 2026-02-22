import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { tenantService } from '../services/tenant.service.js';
import { keycloakService } from '../services/keycloak.service.js';
import { analyticsService } from '../services/analytics.service.js';
import { marketplaceService } from '../services/marketplace.service.js';
import { adminService } from '../services/admin.service.js';
import { pluginRegistryService } from '../services/plugin.service.js';
import { TenantStatus } from '@plexica/database';
import { requireSuperAdmin } from '../middleware/auth.js';
import { db } from '../lib/db.js';
import { sanitizeTenant } from '../lib/tenant-sanitize.js';

// Theme validation schema (T001-13)
// SECURITY: customCss is sanitized to block data-exfiltration vectors (url(), @import, expression())
const CSS_DISALLOWED_PATTERN = /url\s*\(|@import\s|expression\s*\(/i;

const TenantThemeSchema = z.object({
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  fontFamily: z.string().max(100).optional(),
  customCss: z
    .string()
    .max(10240)
    .refine(
      (css) => !CSS_DISALLOWED_PATTERN.test(css),
      'customCss must not contain url(), @import, or expression() to prevent data exfiltration'
    )
    .optional(),
});

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
            description: 'Paginated list of tenants',
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    slug: { type: 'string' },
                    name: { type: 'string' },
                    status: { type: 'string' },
                    deletionScheduledAt: { type: 'string', format: 'date-time', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' },
                },
              },
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
          data: result.tenants.map(sanitizeTenant),
          pagination: {
            page,
            limit,
            total: result.total,
            totalPages,
          },
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({ error: error.message });
      }
    }
  );

  // Check slug availability
  fastify.get<{
    Querystring: { slug: string };
  }>(
    '/admin/tenants/check-slug',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Check if a tenant slug is available (super-admin only)',
        tags: ['admin', 'tenants'],
        querystring: {
          type: 'object',
          required: ['slug'],
          properties: {
            slug: {
              type: 'string',
              description: 'Slug to check',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              slug: { type: 'string' },
              available: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { slug: string } }>, reply: FastifyReply) => {
      const { slug } = request.query;

      // Validate format
      const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;
      if (!SLUG_REGEX.test(slug)) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Invalid slug format. Must be 3–64 chars, start with a letter, end with alphanumeric, lowercase only.',
            details: { slug },
          },
        });
      }

      const existing = await db.tenant.findUnique({ where: { slug } });
      return reply.send({ slug, available: existing === null });
    }
  );

  // Create a new tenant (with full provisioning)
  fastify.post<{
    Body: {
      slug: string;
      name: string;
      adminEmail: string;
      pluginIds?: string[];
      settings?: Record<string, any>;
      theme?: Record<string, any>;
    };
  }>(
    '/admin/tenants',
    {
      attachValidation: true,
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Create a new tenant with full provisioning (super-admin only)',
        tags: ['admin', 'tenants'],
        body: {
          type: 'object',
          required: ['slug', 'name', 'adminEmail'],
          properties: {
            slug: {
              type: 'string',
              pattern: '^[a-z][a-z0-9-]{1,62}[a-z0-9]$',
              description:
                'Unique tenant slug (3-64 chars, starts with letter, ends with alphanumeric)',
              examples: ['acme-corp', 'globex-inc'],
            },
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 255,
              description: 'Tenant display name',
              examples: ['Acme Corporation', 'Globex Inc'],
            },
            adminEmail: {
              type: 'string',
              format: 'email',
              description: 'Email address for the initial tenant admin user',
            },
            pluginIds: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              description: 'Optional list of plugin UUIDs to install after provisioning',
              default: [],
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
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          409: {
            description: 'Tenant with this slug already exists',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          500: {
            description: 'Provisioning failed',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
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
          adminEmail: string;
          pluginIds?: string[];
          settings?: Record<string, any>;
          theme?: Record<string, any>;
        };
      }>,
      reply: FastifyReply
    ) => {
      // Handle schema-level validation failures (required fields, format: 'email', etc.)
      // attachValidation: true prevents Fastify from auto-sending a 400, so we intercept here.
      if ((request as any).validationError) {
        const ve = (request as any).validationError;
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: ve.message ?? 'Request body validation failed',
          },
        });
      }

      try {
        const { slug, name, adminEmail, pluginIds, settings, theme } = request.body;

        // Create tenant with full provisioning
        // This will:
        // 1. Create tenant record in database (status: PROVISIONING)
        // 2. Create PostgreSQL schema for tenant
        // 3. Create Keycloak realm for authentication
        // 4. Initialize default roles and permissions
        // 5. Create MinIO bucket for tenant assets
        // 6. Create initial admin user in Keycloak
        // 7. Send invitation email to admin
        // 8. Update status to ACTIVE (or SUSPENDED if provisioning fails)
        const tenant = await tenantService.createTenant({
          slug,
          name,
          adminEmail,
          pluginIds: pluginIds ?? [],
          settings,
          theme,
        });

        request.log.info({ tenantId: tenant.id, slug: tenant.slug }, 'Tenant created successfully');

        return reply.code(201).send(sanitizeTenant(tenant));
      } catch (error: any) {
        request.log.error({ error, body: request.body }, 'Failed to create tenant');

        // Handle validation errors
        if (error.message.includes('must be')) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.message,
            },
          });
        }

        // Handle duplicate slug errors
        if (error.message.includes('already exists')) {
          return reply.code(409).send({
            error: {
              code: 'SLUG_CONFLICT',
              message: error.message,
            },
          });
        }

        // Handle provisioning errors
        if (error.message.includes('Failed to provision')) {
          return reply.code(500).send({
            error: {
              code: 'PROVISIONING_FAILED',
              message: error.message,
            },
          });
        }

        // Generic server error
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to create tenant',
          },
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
        return reply.send(sanitizeTenant(tenant));
      } catch (error: any) {
        request.log.error({ error, tenantId: request.params.id }, 'Failed to get tenant');

        if (error.message === 'Tenant not found') {
          return reply.code(404).send({
            error: {
              code: 'TENANT_NOT_FOUND',
              message: 'Tenant not found',
            },
          });
        }

        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to retrieve tenant details',
          },
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
        const tenant = await tenantService.suspendTenant(request.params.id);
        return reply.send(sanitizeTenant(tenant));
      } catch (error: any) {
        request.log.error({ error, tenantId: request.params.id }, 'Failed to suspend tenant');

        if (error.message === 'Tenant not found') {
          return reply.code(404).send({
            error: {
              code: 'TENANT_NOT_FOUND',
              message: 'Tenant not found',
            },
          });
        }

        if (error.message?.startsWith('Cannot suspend tenant with status:')) {
          return reply.code(409).send({
            error: {
              code: 'INVALID_TENANT_STATE',
              message: error.message,
            },
          });
        }

        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to suspend tenant',
          },
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
              deletionScheduledAt: { type: 'string', format: 'date-time', nullable: true },
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
        const tenant = await tenantService.activateTenant(request.params.id);
        return reply.send(sanitizeTenant(tenant));
      } catch (error: any) {
        request.log.error({ error, tenantId: request.params.id }, 'Failed to activate tenant');

        if (error.message === 'Tenant not found') {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        if (error.message?.startsWith('Cannot activate tenant with status:')) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_STATUS_TRANSITION',
              message: error.message,
            },
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to activate tenant',
        });
      }
    }
  );

  // Resend invitation email to tenant admin
  fastify.post<{
    Params: { id: string };
  }>(
    '/admin/tenants/:id/resend-invite',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Resend invitation email to tenant admin (super-admin only)',
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
            type: 'object',
            properties: {
              message: { type: 'string' },
              sentAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const tenant = await db.tenant.findUnique({ where: { id: request.params.id } });

        if (!tenant) {
          return reply.code(404).send({
            error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
          });
        }

        const settings = (tenant.settings ?? {}) as Record<string, any>;
        const adminEmail: string | undefined = settings.adminEmail;

        if (!adminEmail) {
          return reply.code(400).send({
            error: { code: 'NO_ADMIN_EMAIL', message: 'No admin email configured for this tenant' },
          });
        }

        if (settings.invitationStatus === 'accepted') {
          return reply.code(400).send({
            error: {
              code: 'INVITATION_ALREADY_ACCEPTED',
              message: 'The invitation has already been accepted',
            },
          });
        }

        // Find the admin user in Keycloak by email and resend required action email
        const users = await keycloakService.listUsers(tenant.slug, { search: adminEmail, max: 10 });
        const adminUser = users.find((u) => u.email === adminEmail);

        if (!adminUser) {
          return reply.code(400).send({
            error: { code: 'NO_ADMIN_EMAIL', message: 'Admin user not found in Keycloak' },
          });
        }

        await keycloakService.sendRequiredActionEmail(tenant.slug, adminUser.id!, [
          'UPDATE_PASSWORD',
          'VERIFY_EMAIL',
        ]);

        // Update invitationStatus to 'pending' (reset if it was 'failed')
        await db.tenant.update({
          where: { id: tenant.id },
          data: { settings: { ...settings, invitationStatus: 'pending' } },
        });

        const sentAt = new Date().toISOString();
        request.log.info({ tenantId: tenant.id, adminEmail }, 'Invitation email resent');

        return reply.send({ message: 'Invitation email sent successfully', sentAt });
      } catch (error: any) {
        request.log.error({ error, tenantId: request.params.id }, 'Failed to resend invitation');

        return reply.code(500).send({
          error: { code: 'EMAIL_SEND_FAILED', message: 'Failed to send invitation email' },
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
              id: { type: 'string' },
              status: { type: 'string' },
              deletionScheduledAt: { type: 'string', format: 'date-time' },
              message: { type: 'string' },
            },
          },
          400: {
            description: 'Tenant already scheduled for deletion',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
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
        const { deletionScheduledAt } = await tenantService.deleteTenant(request.params.id);

        request.log.info({ tenantId: request.params.id }, 'Tenant marked for deletion');

        return reply.send({
          id: request.params.id,
          status: 'PENDING_DELETION',
          deletionScheduledAt: deletionScheduledAt.toISOString(),
          message: 'Tenant scheduled for deletion in 30 days',
        });
      } catch (error: any) {
        request.log.error({ error, tenantId: request.params.id }, 'Failed to delete tenant');

        if (error.message === 'Tenant not found') {
          return reply.code(404).send({
            error: {
              code: 'TENANT_NOT_FOUND',
              message: 'Tenant not found',
            },
          });
        }

        if (error.message?.startsWith('Cannot delete tenant with status:')) {
          // Map PENDING_DELETION back to 400, other invalid states to 409
          const isPendingDeletion = error.message.includes('PENDING_DELETION');
          return reply.code(isPendingDeletion ? 400 : 409).send({
            error: {
              code: isPendingDeletion ? 'ALREADY_PENDING_DELETION' : 'INVALID_TENANT_STATE',
              message: isPendingDeletion
                ? 'Tenant is already scheduled for deletion'
                : error.message,
            },
          });
        }

        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to delete tenant',
          },
        });
      }
    }
  );

  // ===== PLUGIN MANAGEMENT (Global Registry) =====

  // Update tenant (partial update for name, settings, theme)
  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      settings?: Record<string, any>;
      theme?: Record<string, any>;
    };
  }>(
    '/admin/tenants/:id',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Update tenant details (super-admin only)',
        tags: ['admin', 'tenants'],
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
              description: 'Tenant display name',
            },
            settings: {
              type: 'object',
              description: 'Tenant settings (JSON object)',
            },
            theme: {
              type: 'object',
              description: 'Tenant theme configuration (JSON object)',
            },
          },
          additionalProperties: false,
        },
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
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
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
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          settings?: Record<string, any>;
          theme?: Record<string, any>;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, settings, theme } = request.body;
        const updateData: Record<string, any> = {};

        if (name !== undefined) updateData.name = name;
        if (settings !== undefined) updateData.settings = settings;
        if (theme !== undefined) {
          // Validate theme fields with TenantThemeSchema
          const themeResult = TenantThemeSchema.safeParse(theme);
          if (!themeResult.success) {
            return reply.code(400).send({
              error: {
                code: 'THEME_VALIDATION',
                message: 'Invalid theme configuration',
                details: themeResult.error.flatten().fieldErrors,
              },
            });
          }
          updateData.theme = themeResult.data;
        }

        if (Object.keys(updateData).length === 0) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'At least one field (name, settings, theme) must be provided',
            },
          });
        }

        const tenant = await tenantService.updateTenant(request.params.id, updateData);

        request.log.info({ tenantId: tenant.id }, 'Tenant updated successfully');

        return reply.send(sanitizeTenant(tenant));
      } catch (error: any) {
        request.log.error({ error, tenantId: request.params.id }, 'Failed to update tenant');

        if (error.message === 'Tenant not found') {
          return reply.code(404).send({
            error: {
              code: 'TENANT_NOT_FOUND',
              message: 'Tenant not found',
            },
          });
        }

        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to update tenant',
          },
        });
      }
    }
  );

  // ===== PLUGIN MANAGEMENT continued =====

  // List all plugins in registry
  fastify.get<{
    Querystring: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      category?: string;
    };
  }>(
    '/admin/plugins',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'List all plugins in registry with filters (super-admin only)',
        tags: ['admin', 'plugins'],
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
              description: 'Search by plugin name, description, or author',
            },
            status: {
              type: 'string',
              enum: ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'DEPRECATED', 'REJECTED'],
              description: 'Filter by plugin status',
            },
            category: {
              type: 'string',
              description: 'Filter by plugin category',
            },
          },
        },
        response: {
          200: {
            description: 'List of plugins',
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    version: { type: 'string' },
                    status: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string' },
                    author: { type: 'string' },
                    averageRating: { type: 'number' },
                    installCount: { type: 'number' },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { page = 1, limit = 50, search, status, category } = request.query;

        // Use marketplace service to search plugins
        // For admin view, show ALL statuses by default (not just PUBLISHED)
        const result = await marketplaceService.searchPlugins({
          query: search,
          status:
            (status as 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'DEPRECATED' | 'REJECTED') ||
            undefined,
          category: category as
            | 'crm'
            | 'analytics'
            | 'billing'
            | 'marketing'
            | 'productivity'
            | 'communication'
            | 'integration'
            | 'security'
            | 'reporting'
            | 'automation'
            | 'other'
            | undefined,
          page,
          limit,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
        });

        return reply.send(result);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({ error: error.message });
      }
    }
  );

  // Get plugin details by ID
  fastify.get<{
    Params: { id: string };
    Querystring: { includeAllVersions?: boolean };
  }>(
    '/admin/plugins/:id',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Get plugin details by ID (super-admin only)',
        tags: ['admin', 'plugins'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            includeAllVersions: {
              type: 'boolean',
              default: false,
              description: 'Include all versions (not just latest)',
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { includeAllVersions = false } = request.query;
        const plugin = await marketplaceService.getPluginById(
          request.params.id,
          includeAllVersions
        );
        return reply.send(plugin);
      } catch (error: any) {
        request.log.error({ error, pluginId: request.params.id }, 'Failed to get plugin');

        if (error.message.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve plugin details',
        });
      }
    }
  );

  // Create a new plugin in registry (admin shortcut, bypasses marketplace review)
  fastify.post<{
    Body: {
      name: string;
      version: string;
      description: string;
      category: string;
      author: string;
    };
  }>(
    '/admin/plugins',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Create a new plugin in registry (super-admin only)',
        tags: ['admin', 'plugins'],
        body: {
          type: 'object',
          required: ['name', 'version', 'description', 'category', 'author'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            version: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1 },
            category: { type: 'string', minLength: 1 },
            author: { type: 'string', minLength: 1 },
          },
        },
        response: {
          201: {
            description: 'Plugin created',
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              version: { type: 'string' },
              status: { type: 'string' },
              description: { type: 'string' },
              category: { type: 'string' },
              author: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          version: string;
          description: string;
          category: string;
          author: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, version, description, category, author } = request.body;
        // Use marketplace publishPlugin with admin as publisher
        const plugin = await marketplaceService.publishPlugin(
          {
            id: `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            name,
            version,
            description,
            category: category as any,
            author,
            authorEmail: 'admin@plexica.io',
            manifest: {},
            license: 'MIT',
            screenshots: [],
          },
          'super-admin'
        );

        request.log.info({ pluginId: plugin.id }, 'Plugin created by admin');
        return reply.code(201).send(plugin);
      } catch (error: any) {
        request.log.error({ error }, 'Failed to create plugin');
        return reply.code(400).send({
          error: 'Bad Request',
          message: error.message,
        });
      }
    }
  );

  // Update plugin (admin)
  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      version?: string;
      description?: string;
      status?: string;
    };
  }>(
    '/admin/plugins/:id',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Update plugin details (super-admin only)',
        tags: ['admin', 'plugins'],
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
            name: { type: 'string', minLength: 1, maxLength: 255 },
            version: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1 },
            status: {
              type: 'string',
              enum: ['DRAFT', 'PUBLISHED', 'DEPRECATED'],
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: 'Plugin updated',
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              version: { type: 'string' },
              status: { type: 'string' },
              description: { type: 'string' },
              category: { type: 'string' },
              author: { type: 'string' },
            },
          },
          404: {
            description: 'Plugin not found',
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
        Params: { id: string };
        Body: {
          name?: string;
          version?: string;
          description?: string;
          status?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, version, description, status } = request.body;
        const updateData: Record<string, string> = {};

        if (name !== undefined) updateData.name = name;
        if (version !== undefined) updateData.version = version;
        if (description !== undefined) updateData.description = description;
        if (status !== undefined) updateData.status = status;

        if (Object.keys(updateData).length === 0) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'At least one field must be provided',
          });
        }

        // Use marketplace updatePluginMetadata for description changes,
        // or direct update for status/version changes
        const plugin = await marketplaceService.updatePluginMetadata(request.params.id, updateData);

        request.log.info({ pluginId: request.params.id }, 'Plugin updated by admin');
        return reply.send(plugin);
      } catch (error: any) {
        request.log.error({ error, pluginId: request.params.id }, 'Failed to update plugin');

        if (error.message.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update plugin',
        });
      }
    }
  );

  // Delete plugin from registry (admin only)
  fastify.delete<{
    Params: { id: string };
  }>(
    '/admin/plugins/:id',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Delete a plugin from registry (super-admin only)',
        tags: ['admin', 'plugins'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Plugin deleted',
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          404: {
            description: 'Plugin not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          409: {
            description: 'Plugin has active installations',
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
        await pluginRegistryService.deletePlugin(request.params.id);

        request.log.info({ pluginId: request.params.id }, 'Plugin deleted by admin');
        return reply.send({ message: 'Plugin deleted successfully' });
      } catch (error: any) {
        request.log.error({ error, pluginId: request.params.id }, 'Failed to delete plugin');

        if (error.message.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        if (error.message.includes('Cannot delete')) {
          return reply.code(409).send({
            error: 'Conflict',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete plugin',
        });
      }
    }
  );

  // Get plugin installations (which tenants have this plugin installed)
  fastify.get<{
    Params: { id: string };
  }>(
    '/admin/plugins/:id/installs',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Get plugin installation list (which tenants have installed this plugin)',
        tags: ['admin', 'plugins'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'List of tenants that have installed this plugin',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tenantId: { type: 'string' },
                installedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
          404: {
            description: 'Plugin not found',
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
        // Verify plugin exists
        const plugin = await pluginRegistryService.getPlugin(request.params.id);
        if (!plugin) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Plugin '${request.params.id}' not found`,
          });
        }

        // Get all installations for this plugin
        const installations = await db.tenantPlugin.findMany({
          where: { pluginId: request.params.id },
          select: {
            tenantId: true,
            installedAt: true,
          },
          orderBy: { installedAt: 'desc' },
        });

        return reply.send(
          installations.map((i) => ({
            tenantId: i.tenantId,
            installedAt: i.installedAt.toISOString(),
          }))
        );
      } catch (error: any) {
        request.log.error(
          { error, pluginId: request.params.id },
          'Failed to get plugin installations'
        );

        if (error.message?.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve plugin installations',
        });
      }
    }
  );

  // ===== USER MANAGEMENT (Cross-Tenant) =====

  // List all users across all tenants
  fastify.get<{
    Querystring: {
      page?: number;
      limit?: number;
      search?: string;
      tenantId?: string;
      role?: string;
    };
  }>(
    '/admin/users',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description:
          'List all users across all tenants with pagination and filters (super-admin only)',
        tags: ['admin', 'users'],
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
              description: 'Search by user name, email, or tenant name',
            },
            tenantId: {
              type: 'string',
              description: 'Filter by tenant ID',
            },
            role: {
              type: 'string',
              description: 'Filter by role name',
            },
          },
        },
        response: {
          200: {
            description: 'Paginated list of users across all tenants',
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                    firstName: { type: ['string', 'null'] },
                    lastName: { type: ['string', 'null'] },
                    tenantId: { type: 'string' },
                    tenantName: { type: 'string' },
                    tenantSlug: { type: 'string' },
                    roles: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { page = 1, limit = 50, search, tenantId, role } = request.query;

        const result = await adminService.listUsers({
          page,
          limit,
          search,
          tenantId,
          role,
        });

        return reply.send({
          data: result.users,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
          },
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({ error: error.message });
      }
    }
  );

  // Get user details by ID
  fastify.get<{
    Params: { id: string };
  }>(
    '/admin/users/:id',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Get user details by ID with tenant and workspace info (super-admin only)',
        tags: ['admin', 'users'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'User details',
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              name: { type: 'string' },
              firstName: { type: ['string', 'null'] },
              lastName: { type: ['string', 'null'] },
              tenantId: { type: 'string' },
              tenantName: { type: 'string' },
              tenantSlug: { type: 'string' },
              roles: {
                type: 'array',
                items: { type: 'string' },
              },
              createdAt: { type: 'string', format: 'date-time' },
              workspaces: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    slug: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
          404: {
            description: 'User not found',
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
        const user = await adminService.getUserById(request.params.id);
        return reply.send(user);
      } catch (error: any) {
        request.log.error({ error, userId: request.params.id }, 'Failed to get user');

        if (error.message.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve user details',
        });
      }
    }
  );

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
              totalUsers: { type: 'number' },
              totalPlugins: { type: 'number' },
              apiCalls24h: { type: 'number' },
            },
          },
          500: {
            description: 'Internal server error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
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
        return reply.code(500).send({
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
      period?: string;
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
              description: 'Number of days to look back',
            },
            period: {
              type: 'string',
              description: 'Number of days as string (alias for days param)',
            },
          },
        },
        response: {
          200: {
            description: 'Tenant growth data as array of data points',
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
    async (request, reply) => {
      try {
        // Accept either 'days' or 'period' (string alias for days)
        const days = (request.query.days ?? Number(request.query.period)) || 30;
        const data = await analyticsService.getTenantGrowth(days);
        return reply.send(data);
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
            description: 'Plugin usage data as array',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pluginId: { type: 'string' },
                pluginName: { type: 'string' },
                installCount: { type: 'number' },
                activeInstalls: { type: 'number' },
                category: { type: 'string' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const plugins = await analyticsService.getPluginUsage();
        return reply.send(plugins);
      } catch (error: any) {
        request.log.error({ error }, 'Failed to fetch plugin usage data');
        return reply.code(500).send({
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
            description: 'API call metrics as array',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', format: 'date-time' },
                hour: { type: 'number' },
                totalCalls: { type: 'number' },
                successCalls: { type: 'number' },
                errorCalls: { type: 'number' },
                avgLatencyMs: { type: 'number' },
              },
            },
          },
          500: {
            description: 'Internal server error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { hours = 24 } = request.query;
        const metrics = await analyticsService.getApiCallMetrics(hours);
        return reply.send(metrics);
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
