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

import type { FastifyInstance, FastifyReply } from 'fastify';
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
  WorkspaceError,
  WorkspaceErrorCode,
  mapServiceError,
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

/**
 * Handle a service error by mapping it to a WorkspaceError and sending
 * the appropriate error response. If the error cannot be mapped, re-throw
 * it so Fastify's global error handler processes it as a 500.
 *
 * This approach avoids the FST_ERR_FAILED_ERROR_SERIALIZATION error that
 * occurs when throwing custom error classes with statusCode properties in
 * async route handlers.
 *
 * @param error - The error caught from the service layer
 * @param reply - The Fastify reply object
 * @returns Never returns normally (either sends response or throws)
 */
function handleServiceError(error: unknown, reply: FastifyReply): never {
  const mapped = mapServiceError(error);
  if (mapped) {
    // Send error response directly to avoid Fastify serialization issues
    reply.status(mapped.statusCode).send({
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details ? { details: mapped.details } : {}),
      },
    });
    // TypeScript needs this to understand control flow
    throw new Error('Response sent');
  }
  // If not mapped, re-throw so Fastify's error handler processes it as 500
  throw error;
}

/**
 * Re-throw a service error as a WorkspaceError.
 *
 * If the error matches a known workspace error pattern, throw the
 * mapped WorkspaceError. Otherwise re-throw the original error so
 * the global error handler treats it as a 500.
 */
function throwMappedError(error: unknown): never {
  console.log('[throwMappedError] Input error:', {
    isError: error instanceof Error,
    message: error instanceof Error ? error.message : String(error),
    constructor: error?.constructor?.name,
  });
  const mapped = mapServiceError(error);
  console.log('[throwMappedError] Mapped result:', {
    mapped: mapped ? { code: mapped.code, statusCode: mapped.statusCode } : null,
  });
  if (mapped) throw mapped;
  throw error;
}

/**
 * Workspace routes registration
 *
 * Implements 15 API endpoints with Constitution-compliant error format
 * (Art. 6.2) and per-endpoint rate limiting (Art. 9.2):
 *
 * - POST   /api/workspaces                           - Create workspace
 * - GET    /api/workspaces                           - List user's workspaces
 * - GET    /api/workspaces/:workspaceId              - Get workspace details
 * - PATCH  /api/workspaces/:workspaceId              - Update workspace (admin only)
 * - DELETE /api/workspaces/:workspaceId              - Delete workspace (admin only)
 * - GET    /api/workspaces/:workspaceId/members      - List workspace members
 * - GET    /api/workspaces/:workspaceId/members/:userId - Get member details
 * - POST   /api/workspaces/:workspaceId/members      - Add member (admin only)
 * - PATCH  /api/workspaces/:workspaceId/members/:userId - Update member role (admin only)
 * - DELETE /api/workspaces/:workspaceId/members/:userId - Remove member (admin only)
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
              members: { type: 'array' },
              _count: {
                type: 'object',
                properties: {
                  members: { type: 'number' },
                  teams: { type: 'number' },
                },
              },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          400: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
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
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
                memberRole: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] },
                joinedAt: { type: 'string', format: 'date-time' },
                _count: {
                  type: 'object',
                  properties: {
                    members: { type: 'number' },
                    teams: { type: 'number' },
                  },
                },
              },
            },
          },
          429: errorResponseSchema,
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
              members: { type: 'array' },
              teams: { type: 'array' },
              _count: {
                type: 'object',
                properties: {
                  members: { type: 'number' },
                  teams: { type: 'number' },
                },
              },
              userRole: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
          404: errorResponseSchema,
          429: errorResponseSchema,
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
          400: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
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
          400: errorResponseSchema,
          429: errorResponseSchema,
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
        response: {
          429: errorResponseSchema,
        },
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
          404: errorResponseSchema,
          429: errorResponseSchema,
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
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
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
        response: {
          400: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
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
          400: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
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
        response: {
          429: errorResponseSchema,
        },
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
          429: errorResponseSchema,
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
          400: errorResponseSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
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
          429: errorResponseSchema,
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
          404: errorResponseSchema,
          429: errorResponseSchema,
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
}
