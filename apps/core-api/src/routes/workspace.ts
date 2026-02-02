import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { workspaceService } from '../modules/workspace/workspace.service.js';
import { tenantContextMiddleware } from '../middleware/tenant-context.js';
import { authMiddleware } from '../middleware/auth.js';
import { workspaceGuard, workspaceRoleGuard } from '../modules/workspace/guards/index.js';
import {
  validateCreateWorkspace,
  validateUpdateWorkspace,
  validateAddMember,
  validateUpdateMemberRole,
} from '../modules/workspace/dto/index.js';

// Request schemas for Fastify validation
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
 * Workspace routes registration
 *
 * Implements 10 API endpoints:
 * - POST   /api/workspaces              - Create workspace
 * - GET    /api/workspaces              - List user's workspaces
 * - GET    /api/workspaces/:id          - Get workspace details
 * - PATCH  /api/workspaces/:id          - Update workspace (admin only)
 * - DELETE /api/workspaces/:id          - Delete workspace (admin only)
 * - GET    /api/workspaces/:id/members  - List workspace members
 * - GET    /api/workspaces/:id/members/:userId - Get member details
 * - POST   /api/workspaces/:id/members  - Add member (admin only)
 * - PATCH  /api/workspaces/:id/members/:userId - Update member role (admin only)
 * - DELETE /api/workspaces/:id/members/:userId - Remove member (admin only)
 * - GET    /api/workspaces/:id/teams    - List workspace teams
 */
export async function workspaceRoutes(fastify: FastifyInstance) {
  // Create workspace
  // Requires: tenant context, authenticated user
  fastify.post(
    '/workspaces',
    {
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
          409: {
            description: 'Workspace with this slug already exists',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [authMiddleware, tenantContextMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).user?.id;
        if (!userId) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'User not authenticated',
          });
        }

        const body = request.body as any;
        const errors = validateCreateWorkspace(body);
        if (errors.length > 0) {
          return reply.code(400).send({
            error: 'Validation Error',
            message: 'Invalid request data',
            details: errors,
          });
        }

        const workspace = await workspaceService.create(body, userId, (request as any).tenant);
        return reply.code(201).send(workspace);
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error && error.message.includes('already exists')) {
          return reply.code(409).send({
            error: 'Conflict',
            message: error.message,
          });
        }
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create workspace',
        });
      }
    }
  );

  // List user's workspaces
  // Requires: tenant context, authenticated user
  // List user workspaces with pagination and sorting
  // Requires: tenant context, authenticated user
  fastify.get(
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
                memberRole: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] },
                memberCount: { type: 'number' },
                teamCount: { type: 'number' },
              },
            },
          },
        },
      },
      preHandler: [authMiddleware, tenantContextMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).user?.id;
        if (!userId) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'User not authenticated',
          });
        }

        const query = request.query as any;
        const options = {
          limit: query.limit ? parseInt(query.limit, 10) : undefined,
          offset: query.offset ? parseInt(query.offset, 10) : undefined,
          sortBy: query.sortBy || undefined,
          sortOrder: query.sortOrder || undefined,
        };

        const workspaces = await workspaceService.findAll(userId, options, (request as any).tenant);
        return reply.send(workspaces);
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch workspaces',
        });
      }
    }
  );

  // Get workspace details
  // Requires: tenant context, workspace membership
  fastify.get(
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
          404: {
            description: 'Workspace not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId } = request.params as any;
        const workspace = await workspaceService.findOne(workspaceId, (request as any).tenant);

        // Add user's role from workspace membership (set by workspaceGuard)
        const userRole = (request as any).workspaceMembership?.role;

        return reply.send({ ...workspace, userRole });
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch workspace',
        });
      }
    }
  );

  // Update workspace
  // Requires: tenant context, workspace membership, ADMIN role
  fastify.patch(
    '/workspaces/:workspaceId',
    {
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
          404: {
            description: 'Workspace not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId } = request.params as any;
        const body = request.body as any;

        const errors = validateUpdateWorkspace(body);
        if (errors.length > 0) {
          return reply.code(400).send({
            error: 'Validation Error',
            message: 'Invalid request data',
            details: errors,
          });
        }

        const workspace = await workspaceService.update(workspaceId, body, (request as any).tenant);
        return reply.send(workspace);
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update workspace',
        });
      }
    }
  );

  // Delete workspace
  // Requires: tenant context, workspace membership, ADMIN role
  fastify.delete(
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
          400: {
            description: 'Cannot delete workspace with existing teams',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId } = request.params as any;
        await workspaceService.delete(workspaceId, (request as any).tenant);
        return reply.code(204).send();
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error && error.message.includes('existing teams')) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete workspace',
        });
      }
    }
  );

  // Get workspace members with filtering and pagination
  // Requires: tenant context, workspace membership
  fastify.get(
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
      },
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId } = request.params as any;
        const query = request.query as any;

        const options = {
          role: query.role || undefined,
          limit: query.limit ? parseInt(query.limit, 10) : undefined,
          offset: query.offset ? parseInt(query.offset, 10) : undefined,
        };

        const members = await workspaceService.getMembers(
          workspaceId,
          options,
          (request as any).tenant
        );
        return reply.send(members);
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch workspace members',
        });
      }
    }
  );

  // Get specific member details
  // Requires: tenant context, workspace membership
  fastify.get(
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
          404: {
            description: 'Member not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId, userId } = request.params as any;
        const member = await workspaceService.getMemberWithUser(
          workspaceId,
          userId,
          (request as any).tenant
        );
        return reply.send(member);
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Member not found',
          });
        }
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch member details',
        });
      }
    }
  );

  // Add member to workspace
  // Requires: tenant context, workspace membership, ADMIN role
  fastify.post(
    '/workspaces/:workspaceId/members',
    {
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
          409: {
            description: 'User already a member',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId } = request.params as any;
        const body = request.body as any;
        const invitedBy = (request as any).user?.id;

        const errors = validateAddMember(body);
        if (errors.length > 0) {
          return reply.code(400).send({
            error: 'Validation Error',
            message: 'Invalid request data',
            details: errors,
          });
        }

        const member = await workspaceService.addMember(
          workspaceId,
          body,
          invitedBy,
          (request as any).tenant
        );
        return reply.code(201).send(member);
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error && error.message.includes('already a member')) {
          return reply.code(409).send({
            error: 'Conflict',
            message: error.message,
          });
        }
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to add member',
        });
      }
    }
  );

  // Update member role
  // Requires: tenant context, workspace membership, ADMIN role
  fastify.patch(
    '/workspaces/:workspaceId/members/:userId',
    {
      schema: {
        ...updateMemberRoleRequestSchema,
        tags: ['workspaces'],
        summary: 'Update member role',
        description: 'Changes the role of a workspace member. Requires ADMIN role.',
      },
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId, userId } = request.params as any;
        const body = request.body as any;

        const errors = validateUpdateMemberRole(body);
        if (errors.length > 0) {
          return reply.code(400).send({
            error: 'Validation Error',
            message: 'Invalid request data',
            details: errors,
          });
        }

        const member = await workspaceService.updateMemberRole(
          workspaceId,
          userId,
          body.role,
          (request as any).tenant
        );
        return reply.send(member);
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error && error.message.includes('last admin')) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Member not found',
          });
        }
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update member role',
        });
      }
    }
  );

  // Remove member from workspace
  // Requires: tenant context, workspace membership, ADMIN role
  fastify.delete(
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
          400: {
            description: 'Cannot remove last admin',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN']),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId, userId } = request.params as any;
        await workspaceService.removeMember(workspaceId, userId, (request as any).tenant);
        return reply.code(204).send();
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error && error.message.includes('last admin')) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to remove member',
        });
      }
    }
  );

  // Get workspace teams
  // Requires: tenant context, workspace membership
  fastify.get(
    '/workspaces/:workspaceId/teams',
    {
      schema: {
        ...workspaceParamsSchema,
        tags: ['workspaces'],
        summary: 'List workspace teams',
        description: 'Returns all teams in the workspace',
      },
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId } = request.params as any;
        const teams = await workspaceService.getTeams(workspaceId, (request as any).tenant);
        return reply.send(teams);
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch workspace teams',
        });
      }
    }
  );

  // Create team in workspace
  // Requires: tenant context, workspace membership, MEMBER role or higher
  fastify.post(
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
      preHandler: [
        authMiddleware,
        tenantContextMiddleware,
        workspaceGuard,
        workspaceRoleGuard(['ADMIN', 'MEMBER']),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId } = request.params as any;
        const body = request.body as any;
        const userId = (request as any).user?.id;

        if (!userId) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'User not authenticated',
          });
        }

        const team = await workspaceService.createTeam(
          workspaceId,
          {
            name: body.name,
            description: body.description,
            ownerId: userId,
          },
          (request as any).tenant
        );

        return reply.code(201).send(team);
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create team',
        });
      }
    }
  );
}
