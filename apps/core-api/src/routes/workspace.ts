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
 * Implements 9 API endpoints:
 * - POST   /api/workspaces              - Create workspace
 * - GET    /api/workspaces              - List user's workspaces
 * - GET    /api/workspaces/:id          - Get workspace details
 * - PATCH  /api/workspaces/:id          - Update workspace (admin only)
 * - DELETE /api/workspaces/:id          - Delete workspace (admin only)
 * - GET    /api/workspaces/:id/members  - List workspace members
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
      schema: createWorkspaceRequestSchema,
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

        const workspace = await workspaceService.create(body, userId);
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
  fastify.get(
    '/workspaces',
    {
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

        const workspaces = await workspaceService.findAll(userId);
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
      schema: workspaceParamsSchema,
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId } = request.params as any;
        const workspace = await workspaceService.findOne(workspaceId);
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
      schema: updateWorkspaceRequestSchema,
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

        const workspace = await workspaceService.update(workspaceId, body);
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
      schema: workspaceParamsSchema,
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
        await workspaceService.delete(workspaceId);
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

  // Get workspace members
  // Requires: tenant context, workspace membership
  fastify.get(
    '/workspaces/:workspaceId/members',
    {
      schema: workspaceParamsSchema,
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId } = request.params as any;
        const workspace = await workspaceService.findOne(workspaceId);
        return reply.send(workspace.members);
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch workspace members',
        });
      }
    }
  );

  // Add member to workspace
  // Requires: tenant context, workspace membership, ADMIN role
  fastify.post(
    '/workspaces/:workspaceId/members',
    {
      schema: addMemberRequestSchema,
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

        const member = await workspaceService.addMember(workspaceId, body, invitedBy);
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
      schema: updateMemberRoleRequestSchema,
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

        const member = await workspaceService.updateMemberRole(workspaceId, userId, body.role);
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
      schema: memberParamsSchema,
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
        await workspaceService.removeMember(workspaceId, userId);
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
      schema: workspaceParamsSchema,
      preHandler: [authMiddleware, tenantContextMiddleware, workspaceGuard],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId } = request.params as any;
        const teams = await workspaceService.getTeams(workspaceId);
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

        const team = await workspaceService.createTeam(workspaceId, {
          name: body.name,
          description: body.description,
          ownerId: userId,
        });

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
