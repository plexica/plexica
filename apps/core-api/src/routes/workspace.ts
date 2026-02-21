// apps/core-api/src/routes/workspace.ts
//
// Workspace API routes — Constitution Art. 6.2 compliant error format
// and per-endpoint rate limiting (Spec 009, Tasks 6 & 7).
//
// Error handling approach:
//   Service exceptions are mapped to WorkspaceError via mapServiceError().
//   WorkspaceError has statusCode + code fields that the global Fastify
//   error handler (setupErrorHandler) uses to produce Art. 6.2 responses.
//   Validation errors are thrown as WorkspaceError directly.
//
// Rate limiting:
//   Each route has a workspace-specific rate limiter via onRequest hook
//   using Redis sliding-window counters (rateLimiter factory).
//   This is in addition to the global LRU-based rate limiter.

import type { FastifyInstance } from 'fastify';
import { workspaceService } from '../modules/workspace/workspace.service.js';
import { WorkspaceResourceService } from '../modules/workspace/workspace-resource.service.js';
import { tenantContextMiddleware } from '../middleware/tenant-context.js';
import { authMiddleware } from '../middleware/auth.js';
import { workspaceGuard, workspaceRoleGuard } from '../modules/workspace/guards/index.js';
import {
  validateCreateWorkspace,
  validateUpdateWorkspace,
  validateAddMember,
  validateUpdateMemberRole,
  validateShareResource,
} from '../modules/workspace/dto/index.js';
import type { CreateWorkspaceDto } from '../modules/workspace/dto/create-workspace.dto.js';
import type { UpdateWorkspaceDto } from '../modules/workspace/dto/update-workspace.dto.js';
import type { AddMemberDto } from '../modules/workspace/dto/add-member.dto.js';
import type { UpdateMemberRoleDto } from '../modules/workspace/dto/update-member-role.dto.js';
import type { ShareResourceDto, ListSharedResourcesDto } from '../modules/workspace/dto/index.js';
import {
  validateEnableWorkspacePlugin,
  validateUpdateWorkspacePlugin,
} from '../modules/workspace/dto/workspace-plugin.dto.js';
import { workspacePluginService } from '../modules/workspace/workspace-plugin.service.js';
import {
  WorkspaceError,
  WorkspaceErrorCode,
  handleServiceError,
} from '../modules/workspace/utils/error-formatter.js';
import { rateLimiter, WORKSPACE_RATE_LIMITS } from '../middleware/rate-limiter.js';

// --- Shared error response schema (Art. 6.2) ---
const errorResponseSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object', additionalProperties: true },
      },
      required: ['code', 'message'],
    },
  },
  required: ['error'],
};

// --- Request schemas for Fastify validation ---
const createWorkspaceRequestSchema = {
  body: {
    type: 'object',
    required: ['slug', 'name'],
    properties: {
      slug: {
        type: 'string',
        minLength: 2,
        maxLength: 50,
        pattern: '^[a-z0-9-]+$',
        description: 'Unique workspace identifier (lowercase, alphanumeric + hyphens)',
      },
      name: {
        type: 'string',
        minLength: 2,
        maxLength: 100,
        description: 'Workspace display name',
      },
      description: {
        type: 'string',
        maxLength: 500,
        description: 'Optional workspace description',
      },
      settings: {
        type: 'object',
        description: 'Optional workspace settings (JSON)',
      },
    },
  },
};

const updateWorkspaceRequestSchema = {
  params: {
    type: 'object',
    required: ['workspaceId'],
    properties: {
      workspaceId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 2,
        maxLength: 100,
      },
      description: {
        type: 'string',
        maxLength: 500,
      },
      settings: {
        type: 'object',
      },
    },
  },
};

const workspaceParamsSchema = {
  params: {
    type: 'object',
    required: ['workspaceId'],
    properties: {
      workspaceId: { type: 'string' },
    },
  },
};

const addMemberRequestSchema = {
  params: {
    type: 'object',
    required: ['workspaceId'],
    properties: {
      workspaceId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: {
        type: 'string',
        description: 'User ID to add to workspace',
      },
      role: {
        type: 'string',
        enum: ['ADMIN', 'MEMBER', 'VIEWER'],
        description: 'Workspace role (default: MEMBER)',
      },
    },
  },
};

const updateMemberRoleRequestSchema = {
  params: {
    type: 'object',
    required: ['workspaceId', 'userId'],
    properties: {
      workspaceId: { type: 'string' },
      userId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['role'],
    properties: {
      role: {
        type: 'string',
        enum: ['ADMIN', 'MEMBER', 'VIEWER'],
        description: 'New workspace role',
      },
    },
  },
};

const memberParamsSchema = {
  params: {
    type: 'object',
    required: ['workspaceId', 'userId'],
    properties: {
      workspaceId: { type: 'string' },
      userId: { type: 'string' },
    },
  },
};

// handleServiceError is imported from error-formatter.ts (M5 deduplication).
// See: modules/workspace/utils/error-formatter.ts

/**
 * DEPRECATED: Helper function for deprecated throwMappedError pattern.
 * Kept for reference but no longer used.
 * Use handleServiceError() instead which directly sends responses without throwing.
 */
// function throwMappedError(error: unknown): never {
//   console.log('[throwMappedError] Input error:', {
//     isError: error instanceof Error,
//     message: error instanceof Error ? error.message : String(error),
//     constructor: error?.constructor?.name,
//   });
//
//   // Match error message patterns and convert to WorkspaceError
//   const errorMessage = error instanceof Error ? error.message : String(error);
//
//   if (errorMessage.includes('already exists') || errorMessage.includes('unique constraint')) {
//     throw new WorkspaceError(409, 'WORKSPACE_CONFLICT', errorMessage);
//   } else if (errorMessage.includes('not found')) {
//     throw new WorkspaceError(404, 'WORKSPACE_NOT_FOUND', errorMessage);
//   } else if (errorMessage.includes('unauthorized') || errorMessage.includes('permission')) {
//     throw new WorkspaceError(403, 'WORKSPACE_FORBIDDEN', errorMessage);
//   } else if (
//     errorMessage.includes('invalid') ||
//     errorMessage.includes('required') ||
//     errorMessage.includes('validation')
//   ) {
//     throw new WorkspaceError(400, 'WORKSPACE_VALIDATION_ERROR', errorMessage);
//   } else {
//     // Re-throw unrecognized errors so global error handler treats as 500
//     throw error;
//   }
// }

/**
 * Workspace routes registration
 *
 * Implements 17 API endpoints with Constitution-compliant error format
 * (Art. 6.2) and per-endpoint rate limiting (Art. 9.2):
 *
 * - POST   /api/workspaces                           - Create workspace
 * - GET    /api/workspaces                           - List user's workspaces
 * - GET    /api/workspaces/tree                      - Get hierarchy tree (Spec 011)
 * - GET    /api/workspaces/:workspaceId              - Get workspace details
 * - PATCH  /api/workspaces/:workspaceId              - Update workspace (admin only)
 * - DELETE /api/workspaces/:workspaceId              - Delete workspace (admin only)
 * - GET    /api/workspaces/:workspaceId/children     - List direct children (Spec 011)
 * - GET    /api/workspaces/:workspaceId/members      - List workspace members
 * - GET    /api/workspaces/:workspaceId/members/:userId - Get member details
 * - POST   /api/workspaces/:workspaceId/members      - Add member (admin only)
 * - PATCH  /api/workspaces/:workspaceId/members/:userId - Update member role (admin only)
 * - DELETE /api/workspaces/:workspaceId/members/:userId - Remove member (admin only)
 * - PATCH  /api/workspaces/:workspaceId/parent       - Re-parent workspace (admin only, Spec 011 §FR-006)
 * - GET    /api/workspaces/:workspaceId/teams        - List workspace teams
 * - POST   /api/workspaces/:workspaceId/teams        - Create team (member+)
 * - POST   /api/workspaces/:workspaceId/resources/share - Share resource (admin only)
 * - GET    /api/workspaces/:workspaceId/resources    - List shared resources
 * - DELETE /api/workspaces/:workspaceId/resources/:resourceId - Unshare resource (admin only)
 */
export async function workspaceRoutes(fastify: FastifyInstance) {
  // Instantiate WorkspaceResourceService for resource sharing endpoints
  const resourceService = new WorkspaceResourceService();
  // ────────────────────────────────────────────────────────────────
  // POST /workspaces — Create workspace
  // Rate limit: WORKSPACE_CREATE (10/min per tenant)
  // ────────────────────────────────────────────────────────────────
  fastify.post<{
    Body: CreateWorkspaceDto;
  }>(
    '/workspaces',
    {
      attachValidation: true, // Don't throw on validation failure, attach to request.validationError
      schema: {
        ...createWorkspaceRequestSchema,
        tags: ['workspaces'],
        summary: 'Create a new workspace',
        description:
          'Creates a new workspace in the current tenant. The creator becomes the first admin.',
        response: {
          201: {
            description: 'Workspace created successfully',
            type: 'object',
            properties: {
              id: { type: 'string' },
              tenantId: { type: 'string' },
              slug: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              settings: { type: 'object', additionalProperties: true },
              parentId: { type: 'string', nullable: true },
              depth: { type: 'number' },
              path: { type: 'string' },
              members: { type: 'array' },
              _count: {
                type: 'object',
                properties: {
                  members: { type: 'number' },
                  teams: { type: 'number' },
                  children: { type: 'number' },
                },
              },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_CREATE)],
      preHandler: [authMiddleware, tenantContextMiddleware],
    },
    async (request, reply) => {
      // Check for Fastify schema validation errors
      if (request.validationError) {
        return reply.status(400).send({
          error: {
            code: WorkspaceErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: {
              validation: request.validationError.validation,
            },
          },
        });
      }

      const userId = request.user?.id;
      if (!userId) {
        return reply.status(403).send({
          error: {
            code: WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
            message: 'User not authenticated',
          },
        });
      }

      const body = request.body;
      const errors = validateCreateWorkspace(body);
      if (errors.length > 0) {
        return reply.status(400).send({
          error: {
            code: WorkspaceErrorCode.VALIDATION_ERROR,
            message: 'Invalid request data',
            details: { fields: errors },
          },
        });
      }

      try {
        const workspace = await workspaceService.create(body, userId, request.tenant);
        return reply.code(201).send(workspace);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /workspaces — List user's workspaces
  // Rate limit: WORKSPACE_READ (100/min per user)
  // ────────────────────────────────────────────────────────────────
  fastify.get<{
    Querystring: {
      limit?: number;
      offset?: number;
      sortBy?: 'name' | 'createdAt' | 'joinedAt';
      sortOrder?: 'asc' | 'desc';
    };
  }>(
    '/workspaces',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              description: 'Items per page (default: 50)',
            },
            offset: {
              type: 'integer',
              minimum: 0,
              description: 'Number of items to skip (default: 0)',
            },
            sortBy: {
              type: 'string',
              enum: ['name', 'createdAt', 'joinedAt'],
              description: 'Field to sort by (default: joinedAt)',
            },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort order (default: desc)',
            },
          },
        },
        tags: ['workspaces'],
        summary: 'List user workspaces',
        description:
          'Returns all workspaces the authenticated user is a member of with pagination and sorting',
        response: {
          200: {
            description: 'List of workspaces',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                slug: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                parentId: { type: 'string', nullable: true },
                depth: { type: 'number' },
                path: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
                memberRole: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] },
                joinedAt: { type: 'string', format: 'date-time' },
                _count: {
                  type: 'object',
                  properties: {
                    members: { type: 'number' },
                    teams: { type: 'number' },
                    children: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware],
    },
    async (request, reply) => {
      const userId = request.user?.id;
      if (!userId) {
        throw new WorkspaceError(
          WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
          'User not authenticated'
        );
      }

      const { limit, offset, sortBy, sortOrder } = request.query;
      const options = { limit, offset, sortBy, sortOrder };

      try {
        const workspaces = await workspaceService.findAll(userId, options, request.tenant);
        return reply.send(workspaces);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /workspaces/tree — Get workspace tree for current user
  // MUST be registered before /workspaces/:workspaceId to avoid Fastify
  // matching "tree" as an ID param.
  // Rate limit: WORKSPACE_READ (100/min per user)
  // ────────────────────────────────────────────────────────────────
  fastify.get(
    '/workspaces/tree',
    {
      schema: {
        tags: ['workspaces'],
        summary: 'Get workspace tree',
        description:
          'Returns the workspace hierarchy tree filtered to workspaces the authenticated user has access to.',
        response: {
          200: {
            description: 'Workspace tree',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                slug: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                depth: { type: 'number' },
                path: { type: 'string' },
                parentId: { type: 'string', nullable: true },
                memberRole: { type: 'string', nullable: true },
                _count: {
                  type: 'object',
                  properties: {
                    members: { type: 'number' },
                    children: { type: 'number' },
                  },
                },
                children: { type: 'array' },
              },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware],
    },
    async (request, reply) => {
      const userId = request.user?.id;
      if (!userId) {
        throw new WorkspaceError(
          WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
          'User not authenticated'
        );
      }

      const tenantCtx = request.tenant;
      if (!tenantCtx) {
        throw new WorkspaceError(
          WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
          'Tenant context not found'
        );
      }

      try {
        const { workspaceHierarchyService } =
          await import('../modules/workspace/workspace-hierarchy.service.js');
        const tree = await workspaceHierarchyService.getTree(userId, tenantCtx);
        return reply.code(200).send(tree);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /workspaces/:workspaceId — Get workspace details
  // Rate limit: WORKSPACE_READ (100/min per user)
  // ────────────────────────────────────────────────────────────────
  fastify.get<{
    Params: { workspaceId: string };
  }>(
    '/workspaces/:workspaceId',
    {
      schema: {
        ...workspaceParamsSchema,
        tags: ['workspaces'],
        summary: 'Get workspace details',
        description:
          'Returns detailed information about a specific workspace including members and teams',
        response: {
          200: {
            description: 'Workspace details',
            type: 'object',
            properties: {
              id: { type: 'string' },
              tenantId: { type: 'string' },
              slug: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              settings: { type: 'object', additionalProperties: true },
              parentId: { type: 'string', nullable: true },
              depth: { type: 'number' },
              path: { type: 'string' },
              members: { type: 'array' },
              teams: { type: 'array' },
              _count: {
                type: 'object',
                properties: {
                  members: { type: 'number' },
                  teams: { type: 'number' },
                  children: { type: 'number' },
                },
              },
              userRole: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        const workspace = await workspaceService.findOne(workspaceId, request.tenant);

        // Add user's role from workspace membership (set by workspaceGuard)
        const userRole = request.workspaceMembership?.role;

        return reply.send({ ...workspace, userRole });
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // PATCH /workspaces/:workspaceId — Update workspace
  // Rate limit: MEMBER_MANAGEMENT (50/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.patch<{
    Params: { workspaceId: string };
    Body: UpdateWorkspaceDto;
  }>(
    '/workspaces/:workspaceId',
    {
      attachValidation: true, // Don't throw on validation failure
      schema: {
        ...updateWorkspaceRequestSchema,
        tags: ['workspaces'],
        summary: 'Update workspace',
        description: 'Updates workspace details. Requires ADMIN role.',
        response: {
          200: {
            description: 'Workspace updated successfully',
            type: 'object',
            properties: {
              id: { type: 'string' },
              tenantId: { type: 'string' },
              slug: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              settings: { type: 'object', additionalProperties: true },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      // Check for Fastify schema validation errors
      if (request.validationError) {
        return reply.status(400).send({
          error: {
            code: WorkspaceErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: {
              validation: request.validationError.validation,
            },
          },
        });
      }

      const { workspaceId } = request.params;
      const body = request.body;

      const errors = validateUpdateWorkspace(body);
      if (errors.length > 0) {
        return reply.status(400).send({
          error: {
            code: WorkspaceErrorCode.VALIDATION_ERROR,
            message: 'Invalid request data',
            details: { fields: errors },
          },
        });
      }

      try {
        const workspace = await workspaceService.update(workspaceId, body, request.tenant);
        return reply.send(workspace);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // DELETE /workspaces/:workspaceId — Delete workspace
  // Rate limit: MEMBER_MANAGEMENT (50/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.delete<{
    Params: { workspaceId: string };
  }>(
    '/workspaces/:workspaceId',
    {
      schema: {
        ...workspaceParamsSchema,
        tags: ['workspaces'],
        summary: 'Delete workspace',
        description:
          'Deletes a workspace. Cannot delete if workspace has teams. Requires ADMIN role.',
        response: {
          204: {
            description: 'Workspace deleted successfully',
            type: 'null',
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        await workspaceService.delete(workspaceId, request.tenant);
        return reply.code(204).send();
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /workspaces/:workspaceId/children — List direct children
  // Rate limit: WORKSPACE_READ (100/min per user)
  // ────────────────────────────────────────────────────────────────
  fastify.get<{
    Params: { workspaceId: string };
    Querystring: { limit?: number; offset?: number };
  }>(
    '/workspaces/:workspaceId/children',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId'],
          properties: { workspaceId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              description: 'Items per page (default: 50)',
            },
            offset: { type: 'integer', minimum: 0, description: 'Items to skip (default: 0)' },
          },
        },
        tags: ['workspaces'],
        summary: 'List direct child workspaces',
        description: 'Returns paginated direct children of the specified workspace.',
        response: {
          200: {
            description: 'List of child workspaces',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                slug: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                depth: { type: 'number' },
                path: { type: 'string' },
                parentId: { type: 'string', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const { limit = 50, offset = 0 } = request.query;

      const tenantCtx = request.tenant;
      if (!tenantCtx) {
        throw new WorkspaceError(
          WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
          'Tenant context not found'
        );
      }

      try {
        const { workspaceHierarchyService } =
          await import('../modules/workspace/workspace-hierarchy.service.js');
        const children = await workspaceHierarchyService.getDirectChildren(
          workspaceId,
          tenantCtx,
          limit,
          offset
        );
        // Map snake_case DB rows to camelCase API response
        const mapped = children.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          depth: c.depth,
          path: c.path,
          parentId: c.parent_id,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        }));
        return reply.code(200).send(mapped);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /workspaces/:workspaceId/members — List workspace members
  // Rate limit: WORKSPACE_READ (100/min per user)
  // ────────────────────────────────────────────────────────────────
  fastify.get<{
    Params: { workspaceId: string };
    Querystring: {
      role?: 'ADMIN' | 'MEMBER' | 'VIEWER';
      limit?: number;
      offset?: number;
    };
  }>(
    '/workspaces/:workspaceId/members',
    {
      schema: {
        ...workspaceParamsSchema,
        querystring: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              enum: ['ADMIN', 'MEMBER', 'VIEWER'],
              description: 'Filter by role',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              description: 'Items per page (default: 50)',
            },
            offset: {
              type: 'integer',
              minimum: 0,
              description: 'Number of items to skip (default: 0)',
            },
          },
        },
        tags: ['workspaces'],
        summary: 'List workspace members',
        description:
          'Returns all members of a workspace with their roles, supporting filtering and pagination',
        response: {},
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        const { role, limit, offset } = request.query;
        const options = { role, limit, offset };

        const members = await workspaceService.getMembers(workspaceId, options, request.tenant);
        return reply.send(members);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /workspaces/:workspaceId/members/:userId — Get member details
  // Rate limit: WORKSPACE_READ (100/min per user)
  // ────────────────────────────────────────────────────────────────
  fastify.get<{
    Params: { workspaceId: string; userId: string };
  }>(
    '/workspaces/:workspaceId/members/:userId',
    {
      schema: {
        ...memberParamsSchema,
        tags: ['workspaces'],
        summary: 'Get member details',
        description: 'Returns details of a specific workspace member including their profile',
        response: {
          200: {
            description: 'Member details retrieved successfully',
            type: 'object',
            properties: {
              workspaceId: { type: 'string' },
              userId: { type: 'string' },
              role: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] },
              invitedBy: { type: 'string' },
              joinedAt: { type: 'string', format: 'date-time' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                },
              },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request, reply) => {
      try {
        const { workspaceId, userId } = request.params;
        const member = await workspaceService.getMemberWithUser(
          workspaceId,
          userId,
          request.tenant
        );
        return reply.send(member);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // POST /workspaces/:workspaceId/members — Add member
  // Rate limit: MEMBER_MANAGEMENT (50/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string };
    Body: AddMemberDto;
  }>(
    '/workspaces/:workspaceId/members',
    {
      attachValidation: true, // Don't throw on validation failure
      schema: {
        ...addMemberRequestSchema,
        tags: ['workspaces'],
        summary: 'Add member to workspace',
        description: 'Adds a user to the workspace with specified role. Requires ADMIN role.',
        response: {
          201: {
            description: 'Member added successfully',
            type: 'object',
            properties: {
              workspaceId: { type: 'string' },
              userId: { type: 'string' },
              role: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] },
              invitedBy: { type: 'string' },
              joinedAt: { type: 'string', format: 'date-time' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                },
              },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      try {
        // Check for schema validation errors
        if (request.validationError) {
          return reply.code(400).send({
            error: {
              code: WorkspaceErrorCode.VALIDATION_ERROR,
              message: 'Validation failed',
              details: { validation: request.validationError.validation },
            },
          });
        }

        const { workspaceId } = request.params;
        const body = request.body;
        const invitedBy = request.user?.id;
        if (!invitedBy) {
          return reply.code(401).send({
            error: {
              code: WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
              message: 'User not authenticated',
            },
          });
        }

        const errors = validateAddMember(body);
        if (errors.length > 0) {
          return reply.code(400).send({
            error: {
              code: WorkspaceErrorCode.VALIDATION_ERROR,
              message: 'Invalid request data',
              details: { fields: errors },
            },
          });
        }

        const member = await workspaceService.addMember(
          workspaceId,
          body,
          invitedBy,
          request.tenant
        );
        return reply.code(201).send(member);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // PATCH /workspaces/:workspaceId/members/:userId — Update member role
  // Rate limit: MEMBER_MANAGEMENT (50/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.patch<{
    Params: { workspaceId: string; userId: string };
    Body: UpdateMemberRoleDto;
  }>(
    '/workspaces/:workspaceId/members/:userId',
    {
      attachValidation: true, // Don't throw on validation failure
      schema: {
        ...updateMemberRoleRequestSchema,
        tags: ['workspaces'],
        summary: 'Update member role',
        description: 'Changes the role of a workspace member. Requires ADMIN role.',
        response: {},
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      try {
        // Check for schema validation errors
        if (request.validationError) {
          return reply.code(400).send({
            error: {
              code: WorkspaceErrorCode.VALIDATION_ERROR,
              message: 'Validation failed',
              details: { validation: request.validationError.validation },
            },
          });
        }

        const { workspaceId, userId } = request.params;
        const body = request.body;

        const errors = validateUpdateMemberRole(body);
        if (errors.length > 0) {
          return reply.code(400).send({
            error: {
              code: WorkspaceErrorCode.VALIDATION_ERROR,
              message: 'Invalid request data',
              details: { fields: errors },
            },
          });
        }

        const member = await workspaceService.updateMemberRole(
          workspaceId,
          userId,
          body.role,
          request.tenant
        );
        return reply.send(member);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // DELETE /workspaces/:workspaceId/members/:userId — Remove member
  // Rate limit: MEMBER_MANAGEMENT (50/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.delete<{
    Params: { workspaceId: string; userId: string };
  }>(
    '/workspaces/:workspaceId/members/:userId',
    {
      schema: {
        ...memberParamsSchema,
        tags: ['workspaces'],
        summary: 'Remove member from workspace',
        description:
          'Removes a user from the workspace. Cannot remove the last admin. Requires ADMIN role.',
        response: {
          204: {
            description: 'Member removed successfully',
            type: 'null',
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      try {
        const { workspaceId, userId } = request.params;
        await workspaceService.removeMember(workspaceId, userId, request.tenant);
        return reply.code(204).send();
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // PATCH /workspaces/:workspaceId/parent — Re-parent workspace
  // Spec 011 §FR-006 — tenant ADMIN only
  // Rate limit: MEMBER_MANAGEMENT (50/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.patch<{
    Params: { workspaceId: string };
    Body: { parentId: string | null };
  }>(
    '/workspaces/:workspaceId/parent',
    {
      attachValidation: true,
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId'],
          properties: {
            workspaceId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['parentId'],
          properties: {
            parentId: {
              oneOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }],
              description: 'New parent workspace ID, or null to promote to root.',
            },
          },
          additionalProperties: false,
        },
        tags: ['workspaces'],
        summary: 'Re-parent workspace',
        description:
          'Moves a workspace under a new parent (or to root). Requires tenant ADMIN role. Spec 011 §FR-006.',
        response: {
          200: {
            description: 'Workspace re-parented successfully',
            type: 'object',
            properties: {
              id: { type: 'string' },
              parentId: { type: 'string', nullable: true },
              depth: { type: 'number' },
              path: { type: 'string' },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.status(400).send({
          error: {
            code: WorkspaceErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: { validation: request.validationError.validation },
          },
        });
      }

      const { workspaceId } = request.params;
      const { parentId } = request.body;
      const userId = request.user?.id;

      if (!userId) {
        throw new WorkspaceError(
          WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
          'User not authenticated'
        );
      }

      try {
        const result = await workspaceService.reparent(
          workspaceId,
          parentId ?? null,
          userId,
          request.tenant
        );
        return reply.code(200).send(result);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /workspaces/:workspaceId/teams — List workspace teams
  // Rate limit: WORKSPACE_READ (100/min per user)
  // ────────────────────────────────────────────────────────────────
  fastify.get<{ Params: { workspaceId: string } }>(
    '/workspaces/:workspaceId/teams',
    {
      schema: {
        ...workspaceParamsSchema,
        tags: ['workspaces'],
        summary: 'List workspace teams',
        description: 'Returns all teams in the workspace',
        response: {},
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        const teams = await workspaceService.getTeams(workspaceId, request.tenant);
        return reply.send(teams);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // POST /workspaces/:workspaceId/teams — Create team
  // Rate limit: MEMBER_MANAGEMENT (50/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string };
    Body: { name: string; description?: string };
  }>(
    '/workspaces/:workspaceId/teams',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId'],
          properties: {
            workspaceId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              minLength: 2,
              maxLength: 100,
              description: 'Team name',
            },
            description: {
              type: 'string',
              maxLength: 500,
              description: 'Optional team description',
            },
          },
        },
        tags: ['workspaces'],
        summary: 'Create team in workspace',
        description: 'Creates a new team in the workspace. Requires MEMBER role or higher.',
        response: {
          201: {
            description: 'Team created successfully',
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              workspaceId: { type: 'string' },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN', 'MEMBER']),
      ],
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const userId = request.user?.id;

      if (!userId) {
        throw new WorkspaceError(
          WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
          'User not authenticated'
        );
      }

      try {
        const team = await workspaceService.createTeam(
          workspaceId,
          {
            name: request.body.name,
            description: request.body.description,
            ownerId: userId,
          },
          request.tenant
        );

        return reply.code(201).send(team);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // POST /workspaces/:workspaceId/resources/share — Share resource with workspace
  // Rate limit: RESOURCE_SHARING (20/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string };
    Body: ShareResourceDto;
  }>(
    '/workspaces/:workspaceId/resources/share',
    {
      attachValidation: true, // Don't throw on validation failure, attach to request.validationError
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId'],
          properties: {
            workspaceId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['resourceType', 'resourceId'],
          properties: {
            resourceType: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              pattern: '^[a-z0-9][a-z0-9\\-_]*[a-z0-9]$',
              description:
                'Type of resource to share (e.g., "plugin", "template", "dataset"). Lowercase alphanumeric with hyphens/underscores.',
              examples: ['plugin', 'template', 'dataset', 'custom-resource'],
            },
            resourceId: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier of the resource to share',
              examples: ['550e8400-e29b-41d4-a716-446655440000'],
            },
          },
          additionalProperties: false,
        },
        tags: ['workspaces', 'resources'],
        summary: 'Share resource with workspace',
        description:
          'Shares a resource (plugin, template, dataset, etc.) with a workspace. Requires ADMIN role and enabled cross-workspace sharing.',
        response: {
          201: {
            description: 'Resource shared successfully',
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              workspaceId: { type: 'string', format: 'uuid' },
              resourceType: { type: 'string' },
              resourceId: { type: 'string', format: 'uuid' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.RESOURCE_SHARING)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const body = request.body;
      const userId = request.user?.id;

      // Handle Fastify schema validation errors (attachValidation: true)
      if (request.validationError) {
        return reply.code(400).send({
          error: {
            code: WorkspaceErrorCode.VALIDATION_ERROR,
            message: request.validationError.message,
            details: request.validationError.validation,
          },
        });
      }

      if (!userId) {
        throw new WorkspaceError(
          WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
          'User not authenticated'
        );
      }

      const errors = validateShareResource(body);
      if (errors.length > 0) {
        throw new WorkspaceError(WorkspaceErrorCode.VALIDATION_ERROR, 'Invalid request data', {
          fields: errors,
        });
      }

      try {
        const resource = await resourceService.shareResource(
          workspaceId,
          body,
          userId,
          request.tenant
        );
        return reply.code(201).send(resource);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /workspaces/:workspaceId/resources — List shared resources
  // Rate limit: WORKSPACE_READ (100/min per user)
  // ────────────────────────────────────────────────────────────────
  fastify.get<{
    Params: { workspaceId: string };
    Querystring: ListSharedResourcesDto;
  }>(
    '/workspaces/:workspaceId/resources',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId'],
          properties: {
            workspaceId: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            resourceType: {
              type: 'string',
              description: 'Filter by resource type (optional)',
              examples: ['plugin', 'template', 'dataset'],
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 50,
              description: 'Maximum number of results to return',
            },
            offset: {
              type: 'integer',
              minimum: 0,
              default: 0,
              description: 'Number of results to skip (for pagination)',
            },
          },
          additionalProperties: false,
        },
        tags: ['workspaces', 'resources'],
        summary: 'List shared resources',
        description:
          'Returns all resources shared with a workspace, with optional filtering and pagination.',
        response: {
          200: {
            description: 'List of shared resources',
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    workspaceId: { type: 'string', format: 'uuid' },
                    resourceType: { type: 'string' },
                    resourceId: { type: 'string', format: 'uuid' },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  limit: { type: 'integer' },
                  offset: { type: 'integer' },
                  total: { type: 'integer' },
                  hasMore: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        const query = request.query as ListSharedResourcesDto;

        const result = await resourceService.listResources(workspaceId, query, request.tenant);
        return reply.send(result);
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // DELETE /workspaces/:workspaceId/resources/:resourceId — Unshare resource
  // Rate limit: RESOURCE_SHARING (20/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.delete<{
    Params: { workspaceId: string; resourceId: string };
  }>(
    '/workspaces/:workspaceId/resources/:resourceId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId', 'resourceId'],
          properties: {
            workspaceId: { type: 'string', format: 'uuid' },
            resourceId: { type: 'string', format: 'uuid' },
          },
        },
        tags: ['workspaces', 'resources'],
        summary: 'Unshare resource from workspace',
        description: 'Removes a resource share link from a workspace. Requires ADMIN role.',
        response: {
          204: {
            description: 'Resource unshared successfully',
            type: 'null',
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.RESOURCE_SHARING)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      const { workspaceId, resourceId } = request.params;
      const userId = request.user?.id;

      if (!userId) {
        throw new WorkspaceError(
          WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
          'User not authenticated'
        );
      }

      try {
        await resourceService.unshareResource(workspaceId, resourceId, userId, request.tenant);
        return reply.code(204).send();
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // POST /workspaces/:workspaceId/plugins — Enable plugin for workspace
  // Spec 011 Phase 2, FR-023 — workspace ADMIN only
  // Rate limit: MEMBER_MANAGEMENT (50/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string };
    Body: { pluginId: string; config?: Record<string, unknown> };
  }>(
    '/workspaces/:workspaceId/plugins',
    {
      attachValidation: true,
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId'],
          properties: { workspaceId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['pluginId'],
          properties: {
            pluginId: { type: 'string', description: 'Plugin identifier to enable' },
            config: {
              type: 'object',
              additionalProperties: true,
              description: 'Optional initial plugin configuration',
            },
          },
        },
        tags: ['workspaces'],
        summary: 'Enable plugin for workspace',
        description:
          'Enables a tenant-level plugin for this workspace. Requires workspace ADMIN role.',
        response: {
          201: {
            description: 'Plugin enabled successfully',
            type: 'object',
            properties: {
              workspaceId: { type: 'string' },
              pluginId: { type: 'string' },
              enabled: { type: 'boolean' },
              configuration: { type: 'object', additionalProperties: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.status(400).send({
          error: {
            code: WorkspaceErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: { validation: request.validationError.validation },
          },
        });
      }

      const errors = validateEnableWorkspacePlugin(request.body);
      if (errors.length > 0) {
        return reply.status(400).send({
          error: {
            code: WorkspaceErrorCode.VALIDATION_ERROR,
            message: 'Invalid request data',
            details: { fields: errors },
          },
        });
      }

      const { workspaceId } = request.params;
      const { pluginId, config = {} } = request.body;

      try {
        const row = await workspacePluginService.enablePlugin(
          workspaceId,
          pluginId,
          config,
          request.tenant! // tenantContextMiddleware + workspaceGuard guarantee non-null
        );
        return reply.code(201).send({
          workspaceId: row.workspace_id,
          pluginId: row.plugin_id,
          enabled: row.enabled,
          configuration: row.configuration,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /workspaces/:workspaceId/plugins — List workspace plugins
  // Spec 011 Phase 2, FR-025 — any workspace member
  // Rate limit: WORKSPACE_READ (100/min per user)
  // ────────────────────────────────────────────────────────────────
  fastify.get<{
    Params: { workspaceId: string };
  }>(
    '/workspaces/:workspaceId/plugins',
    {
      schema: {
        ...workspaceParamsSchema,
        tags: ['workspaces'],
        summary: 'List workspace plugins',
        description: 'Returns all plugin records for the workspace (enabled and disabled).',
        response: {
          200: {
            description: 'List of workspace plugins',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                workspaceId: { type: 'string' },
                pluginId: { type: 'string' },
                enabled: { type: 'boolean' },
                configuration: { type: 'object', additionalProperties: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_READ)],
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request, reply) => {
      const { workspaceId } = request.params;

      try {
        const rows = await workspacePluginService.listPlugins(workspaceId, request.tenant!);
        return reply.send(
          rows.map((r) => ({
            workspaceId: r.workspace_id,
            pluginId: r.plugin_id,
            enabled: r.enabled,
            configuration: r.configuration,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          }))
        );
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // PATCH /workspaces/:workspaceId/plugins/:pluginId — Update plugin config
  // Spec 011 Phase 2, FR-024 — workspace ADMIN only
  // Rate limit: MEMBER_MANAGEMENT (50/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.patch<{
    Params: { workspaceId: string; pluginId: string };
    Body: { config: Record<string, unknown> };
  }>(
    '/workspaces/:workspaceId/plugins/:pluginId',
    {
      attachValidation: true,
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId', 'pluginId'],
          properties: {
            workspaceId: { type: 'string' },
            pluginId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['config'],
          properties: {
            config: {
              type: 'object',
              additionalProperties: true,
              description: 'Updated plugin configuration',
            },
          },
        },
        tags: ['workspaces'],
        summary: 'Update workspace plugin config',
        description:
          'Updates the configuration for an enabled workspace plugin. Requires ADMIN role.',
        response: {
          200: {
            description: 'Plugin configuration updated',
            type: 'object',
            properties: {
              workspaceId: { type: 'string' },
              pluginId: { type: 'string' },
              enabled: { type: 'boolean' },
              configuration: { type: 'object', additionalProperties: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.status(400).send({
          error: {
            code: WorkspaceErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: { validation: request.validationError.validation },
          },
        });
      }

      const errors = validateUpdateWorkspacePlugin(request.body);
      if (errors.length > 0) {
        return reply.status(400).send({
          error: {
            code: WorkspaceErrorCode.VALIDATION_ERROR,
            message: 'Invalid request data',
            details: { fields: errors },
          },
        });
      }

      const { workspaceId, pluginId } = request.params;
      const { config } = request.body;

      try {
        const row = await workspacePluginService.updateConfig(
          workspaceId,
          pluginId,
          config,
          request.tenant!
        );
        return reply.send({
          workspaceId: row.workspace_id,
          pluginId: row.plugin_id,
          enabled: row.enabled,
          configuration: row.configuration,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // DELETE /workspaces/:workspaceId/plugins/:pluginId — Disable workspace plugin
  // Spec 011 Phase 2, FR-023 — workspace ADMIN only
  // Rate limit: MEMBER_MANAGEMENT (50/min per workspace)
  // ────────────────────────────────────────────────────────────────
  fastify.delete<{
    Params: { workspaceId: string; pluginId: string };
  }>(
    '/workspaces/:workspaceId/plugins/:pluginId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId', 'pluginId'],
          properties: {
            workspaceId: { type: 'string' },
            pluginId: { type: 'string' },
          },
        },
        tags: ['workspaces'],
        summary: 'Disable workspace plugin',
        description:
          'Disables a plugin for this workspace (preserves configuration). Requires ADMIN role.',
        response: {
          204: { description: 'Plugin disabled successfully', type: 'null' },
        },
      },
      onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT)],
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request, reply) => {
      const { workspaceId, pluginId } = request.params;

      try {
        await workspacePluginService.disablePlugin(workspaceId, pluginId, request.tenant!);
        return reply.code(204).send();
      } catch (error) {
        handleServiceError(error, reply);
      }
    }
  );
}
