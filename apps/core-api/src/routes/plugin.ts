import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pluginRegistryService, pluginLifecycleService } from '../services/plugin.service.js';
import type { PluginManifest } from '../types/plugin.types.js';
import { requireSuperAdmin, authMiddleware, requireTenantAccess } from '../middleware/auth.js';
import { PluginStatus } from '@plexica/database';
import { workspaceTemplateService } from '../modules/workspace/workspace-template.service.js';
import {
  RegisterTemplateSchema,
  type RegisterTemplateDto,
} from '../modules/plugin/dto/register-template.dto.js';
import {
  handleServiceError,
  registerWorkspaceErrorHandler,
} from '../modules/workspace/utils/error-formatter.js';

export async function pluginRoutes(fastify: FastifyInstance) {
  // Register local error handler — required because Fastify v5 child plugin
  // scopes capture the error handler at registration time, before the global
  // setupErrorHandler() is called in buildTestApp()/server.ts.
  registerWorkspaceErrorHandler(fastify);

  // =====================================
  // Global Plugin Registry Routes
  // =====================================

  /**
   * Register a new plugin in the global registry
   * Only super admins can register plugins
   */
  fastify.post<{
    Body: PluginManifest;
  }>(
    '/plugins',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description: 'Register a new plugin in the global registry',
        tags: ['plugins'],
        body: {
          type: 'object',
          required: ['id', 'name', 'version', 'description', 'category', 'metadata'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            version: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            metadata: { type: 'object' },
          },
          additionalProperties: true, // Allow permissions, config, lifecycle, etc.
        },
        response: {
          201: {
            description: 'Plugin registered successfully',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: PluginManifest }>, reply: FastifyReply) => {
      try {
        const plugin = await pluginRegistryService.registerPlugin(request.body);
        return reply.code(201).send(plugin);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * List all plugins in the registry
   */
  fastify.get<{
    Querystring: {
      status?: PluginStatus;
      category?: string;
      search?: string;
      skip?: number;
      take?: number;
    };
  }>(
    '/plugins',
    {
      preHandler: [authMiddleware],
      schema: {
        description: 'List all plugins in the global registry',
        tags: ['plugins'],
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'DEPRECATED', 'REJECTED'],
            },
            category: { type: 'string' },
            search: { type: 'string' },
            skip: { type: 'number', minimum: 0, default: 0 },
            take: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: {
          200: {
            description: 'List of plugins',
            type: 'object',
            properties: {
              plugins: { type: 'array' },
              total: { type: 'number' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          status?: PluginStatus;
          category?: string;
          search?: string;
          skip?: number;
          take?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const result = await pluginRegistryService.listPlugins(request.query);
        return reply.send(result);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Get plugin details
   */
  fastify.get<{
    Params: { pluginId: string };
  }>(
    '/plugins/:pluginId',
    {
      preHandler: [authMiddleware],
      schema: {
        description: 'Get plugin details from the global registry',
        tags: ['plugins'],
        params: {
          type: 'object',
          required: ['pluginId'],
          properties: {
            pluginId: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Plugin details',
            type: 'object',
            additionalProperties: true,
          },
          404: {
            description: 'Plugin not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { pluginId: string } }>, reply: FastifyReply) => {
      try {
        const plugin = await pluginRegistryService.getPlugin(request.params.pluginId);
        return reply.send(plugin);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(404)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Update plugin in registry
   */
  fastify.put<{
    Params: { pluginId: string };
    Body: PluginManifest;
  }>(
    '/plugins/:pluginId',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description: 'Update plugin in the global registry',
        tags: ['plugins'],
        params: {
          type: 'object',
          required: ['pluginId'],
          properties: {
            pluginId: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Plugin updated successfully',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { pluginId: string }; Body: PluginManifest }>,
      reply: FastifyReply
    ) => {
      try {
        const plugin = await pluginRegistryService.updatePlugin(
          request.params.pluginId,
          request.body
        );
        return reply.send(plugin);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Delete plugin from registry
   */
  fastify.delete<{
    Params: { pluginId: string };
  }>(
    '/plugins/:pluginId',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description: 'Delete plugin from the global registry',
        tags: ['plugins'],
        params: {
          type: 'object',
          required: ['pluginId'],
          properties: {
            pluginId: { type: 'string' },
          },
        },
        response: {
          204: {
            description: 'Plugin deleted successfully',
            type: 'null',
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { pluginId: string } }>, reply: FastifyReply) => {
      try {
        await pluginRegistryService.deletePlugin(request.params.pluginId);
        return reply.code(204).send();
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Get plugin statistics
   */
  fastify.get<{
    Params: { pluginId: string };
  }>(
    '/plugins/:pluginId/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        description: 'Get plugin installation statistics',
        tags: ['plugins'],
        params: {
          type: 'object',
          required: ['pluginId'],
          properties: {
            pluginId: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Plugin statistics',
            type: 'object',
            properties: {
              installCount: { type: 'number' },
              activeTenants: { type: 'number' },
              version: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { pluginId: string } }>, reply: FastifyReply) => {
      try {
        const stats = await pluginRegistryService.getPluginStats(request.params.pluginId);
        return reply.send(stats);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(404)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // =====================================
  // Tenant Plugin Management Routes
  // =====================================

  /**
   * Install plugin for a tenant
   */
  fastify.post<{
    Params: { id: string; pluginId: string };
    Body: { configuration?: Record<string, unknown> };
  }>(
    '/tenants/:id/plugins/:pluginId/install',
    {
      preHandler: [authMiddleware, requireTenantAccess],
      schema: {
        description: 'Install a plugin for a tenant',
        tags: ['plugins', 'tenants'],
        params: {
          type: 'object',
          required: ['id', 'pluginId'],
          properties: {
            id: { type: 'string' },
            pluginId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            configuration: { type: 'object' },
          },
        },
        response: {
          201: {
            description: 'Plugin installed successfully',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string; pluginId: string };
        Body: { configuration?: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { id: tenantId, pluginId } = request.params;
        const { configuration = {} } = request.body;

        const installation = await pluginLifecycleService.installPlugin(
          tenantId,
          pluginId,
          configuration
        );
        return reply.code(201).send(installation);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Activate plugin for a tenant
   */
  fastify.post<{
    Params: { id: string; pluginId: string };
  }>(
    '/tenants/:id/plugins/:pluginId/activate',
    {
      preHandler: [authMiddleware, requireTenantAccess],
      schema: {
        description: 'Activate a plugin for a tenant',
        tags: ['plugins', 'tenants'],
        params: {
          type: 'object',
          required: ['id', 'pluginId'],
          properties: {
            id: { type: 'string' },
            pluginId: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Plugin activated successfully',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string; pluginId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id: tenantId, pluginId } = request.params;
        const result = await pluginLifecycleService.activatePlugin(tenantId, pluginId);
        return reply.send(result);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Deactivate plugin for a tenant
   */
  fastify.post<{
    Params: { id: string; pluginId: string };
  }>(
    '/tenants/:id/plugins/:pluginId/deactivate',
    {
      preHandler: [authMiddleware, requireTenantAccess],
      schema: {
        description: 'Deactivate a plugin for a tenant',
        tags: ['plugins', 'tenants'],
        params: {
          type: 'object',
          required: ['id', 'pluginId'],
          properties: {
            id: { type: 'string' },
            pluginId: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Plugin deactivated successfully',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string; pluginId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id: tenantId, pluginId } = request.params;
        const result = await pluginLifecycleService.deactivatePlugin(tenantId, pluginId);
        return reply.send(result);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Uninstall plugin from a tenant
   */
  fastify.delete<{
    Params: { id: string; pluginId: string };
  }>(
    '/tenants/:id/plugins/:pluginId',
    {
      preHandler: [authMiddleware, requireTenantAccess],
      schema: {
        description: 'Uninstall a plugin from a tenant',
        tags: ['plugins', 'tenants'],
        params: {
          type: 'object',
          required: ['id', 'pluginId'],
          properties: {
            id: { type: 'string' },
            pluginId: { type: 'string' },
          },
        },
        response: {
          204: {
            description: 'Plugin uninstalled successfully',
            type: 'null',
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string; pluginId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id: tenantId, pluginId } = request.params;
        await pluginLifecycleService.uninstallPlugin(tenantId, pluginId);
        return reply.code(204).send();
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Update plugin configuration
   */
  fastify.patch<{
    Params: { id: string; pluginId: string };
    Body: { configuration: Record<string, unknown> };
  }>(
    '/tenants/:id/plugins/:pluginId/configuration',
    {
      preHandler: [authMiddleware, requireTenantAccess],
      schema: {
        description: 'Update plugin configuration for a tenant',
        tags: ['plugins', 'tenants'],
        params: {
          type: 'object',
          required: ['id', 'pluginId'],
          properties: {
            id: { type: 'string' },
            pluginId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['configuration'],
          properties: {
            configuration: { type: 'object' },
          },
        },
        response: {
          200: {
            description: 'Configuration updated successfully',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string; pluginId: string };
        Body: { configuration: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { id: tenantId, pluginId } = request.params;
        const { configuration } = request.body;

        const result = await pluginLifecycleService.updateConfiguration(
          tenantId,
          pluginId,
          configuration
        );
        return reply.send(result);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Get installed plugins for a tenant
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/tenants/:id/plugins',
    {
      preHandler: [authMiddleware, requireTenantAccess],
      schema: {
        description: 'Get all installed plugins for a tenant',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'List of installed plugins',
            type: 'array',
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const plugins = await pluginLifecycleService.getInstalledPlugins(request.params.id);
        return reply.send(plugins);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // =====================================
  // Plugin Template Registration Routes (Spec 011 — T011-15, FR-028)
  // =====================================

  /**
   * Register a template provided by a plugin.
   * Only super admins can register plugin templates.
   */
  fastify.post<{
    Params: { pluginId: string };
    Body: RegisterTemplateDto;
  }>(
    '/plugins/:pluginId/templates',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description: 'Register a workspace template provided by a plugin',
        tags: ['plugins', 'templates'],
        params: {
          type: 'object',
          required: ['pluginId'],
          properties: {
            pluginId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['name', 'items'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            isDefault: { type: 'boolean' },
            metadata: { type: 'object' },
            items: { type: 'array' },
          },
          additionalProperties: false,
        },
        response: {
          201: {
            description: 'Template registered successfully',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { pluginId: string }; Body: RegisterTemplateDto }>,
      reply: FastifyReply
    ) => {
      try {
        const parsed = RegisterTemplateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid template data',
              details: { issues: parsed.error.issues },
            },
          });
        }
        const template = await workspaceTemplateService.registerTemplate(
          request.params.pluginId,
          parsed.data
        );
        return reply.code(201).send(template);
      } catch (error: unknown) {
        request.log.error(error);
        handleServiceError(error, reply);
      }
    }
  );

  /**
   * Replace all items of an existing plugin-provided template.
   * Only super admins can update plugin templates.
   */
  fastify.put<{
    Params: { pluginId: string; templateId: string };
    Body: RegisterTemplateDto;
  }>(
    '/plugins/:pluginId/templates/:templateId',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description: 'Update a workspace template provided by a plugin',
        tags: ['plugins', 'templates'],
        params: {
          type: 'object',
          required: ['pluginId', 'templateId'],
          properties: {
            pluginId: { type: 'string' },
            templateId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['name', 'items'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            isDefault: { type: 'boolean' },
            metadata: { type: 'object' },
            items: { type: 'array' },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: 'Template updated successfully',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { pluginId: string; templateId: string };
        Body: RegisterTemplateDto;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const parsed = RegisterTemplateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid template data',
              details: { issues: parsed.error.issues },
            },
          });
        }
        const template = await workspaceTemplateService.updateTemplate(
          request.params.pluginId,
          request.params.templateId,
          parsed.data
        );
        return reply.send(template);
      } catch (error: unknown) {
        request.log.error(error);
        handleServiceError(error, reply);
      }
    }
  );

  /**
   * Delete a plugin-provided template and all its items.
   * Only super admins can delete plugin templates.
   */
  fastify.delete<{
    Params: { pluginId: string; templateId: string };
  }>(
    '/plugins/:pluginId/templates/:templateId',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description: 'Delete a workspace template provided by a plugin',
        tags: ['plugins', 'templates'],
        params: {
          type: 'object',
          required: ['pluginId', 'templateId'],
          properties: {
            pluginId: { type: 'string' },
            templateId: { type: 'string' },
          },
        },
        response: {
          204: {
            description: 'Template deleted successfully',
            type: 'null',
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { pluginId: string; templateId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        await workspaceTemplateService.deleteTemplate(
          request.params.pluginId,
          request.params.templateId
        );
        return reply.code(204).send();
      } catch (error: unknown) {
        request.log.error(error);
        handleServiceError(error, reply);
      }
    }
  );
}
