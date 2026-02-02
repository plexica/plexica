import type { FastifyRequest, FastifyReply } from 'fastify';
import { workspaceService } from '../workspace.service.js';
import { setWorkspaceId, getTenantContext } from '../../../middleware/tenant-context.js';

/**
 * Workspace Guard Middleware
 *
 * Extracts workspace ID from request and validates user has access
 * Priority: Header > Path Param > Query > Body
 *
 * Sets workspaceId in tenant context if valid
 * Attaches workspaceMembership to request for role checking
 */
export async function workspaceGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Get tenant context from request (set by tenantContextMiddleware)
    const tenantContext = (request as any).tenant;
    if (!tenantContext) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Tenant context not found',
      });
    }

    // Extract user ID from request (assuming set by auth middleware)
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Extract workspace ID from multiple sources (priority order)
    const workspaceId =
      (request.headers['x-workspace-id'] as string) ||
      (request.params as any)?.workspaceId ||
      (request.query as any)?.workspaceId ||
      (request.body as any)?.workspaceId;

    if (!workspaceId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message:
          'Workspace ID required (provide via X-Workspace-ID header, path param, query, or body)',
      });
    }

    // Verify workspace exists, belongs to current tenant, and user has membership
    // Pass tenant context explicitly to avoid AsyncLocalStorage issues
    const membership = await workspaceService.getMembership(workspaceId, userId, tenantContext);

    if (!membership) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Access to workspace denied. Workspace not found or user is not a member.',
      });
    }

    // Note: We don't set workspace ID in AsyncLocalStorage because it's unreliable with Fastify
    // The workspace ID is already available via request.workspaceMembership.workspaceId
    // setWorkspaceId(workspaceId);

    // Attach membership to request for role guard
    (request as any).workspaceMembership = membership;
  } catch (error) {
    request.log.error(error, 'Error in workspace guard');
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to validate workspace access',
    });
  }
}

/**
 * Decorator to add workspace membership to FastifyRequest
 */
declare module 'fastify' {
  interface FastifyRequest {
    workspaceMembership?: {
      workspaceId: string;
      userId: string;
      role: 'ADMIN' | 'MEMBER' | 'VIEWER';
      invitedBy: string;
      joinedAt: Date;
    };
  }
}
