import type { FastifyRequest, FastifyReply } from 'fastify';
import { workspaceService } from '../workspace.service.js';
import { WorkspaceHierarchyService } from '../workspace-hierarchy.service.js';
import type { WorkspaceAccess } from '../types/access.types.js';

/** Singleton hierarchy service used for ancestor-admin fallback checks */
const hierarchyService = new WorkspaceHierarchyService();

/**
 * Workspace Guard Middleware
 *
 * Extracts workspace ID from request and validates user has access.
 * Priority: Header > Path Param > Query > Body
 *
 * Access resolution order (Spec 011, FR-011, FR-012):
 *   1. Direct membership check (unchanged behaviour)
 *   2. Hierarchical fallback: if user is ADMIN of any ancestor workspace,
 *      grant HIERARCHICAL_READER access (read-only)
 *   3. Deny with 403 if neither check passes
 *
 * Attaches `workspaceMembership` (direct) or `workspaceAccess` (hierarchical)
 * to the request for downstream role guards.
 */
export async function workspaceGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Get tenant context from request (set by tenantContextMiddleware)
    const tenantContext = (request as any).tenant;
    if (!tenantContext) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Tenant context not found',
        },
      });
    }

    // Extract user ID from request (assuming set by auth middleware)
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
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
        error: {
          code: 'BAD_REQUEST',
          message:
            'Workspace ID required (provide via X-Workspace-ID header, path param, query, or body)',
        },
      });
    }

    // Step 1: Check workspace exists and get direct membership
    const { exists, membership, workspaceRow } = await workspaceService.checkAccessAndGetMembership(
      workspaceId,
      userId,
      tenantContext
    );

    if (!exists) {
      return reply.code(404).send({
        error: {
          code: 'WORKSPACE_NOT_FOUND',
          message: 'Workspace not found or does not belong to this tenant',
        },
      });
    }

    if (membership) {
      // Direct member — attach membership and continue (unchanged behaviour)
      (request as any).workspaceMembership = membership;
      (request as any).workspaceAccess = {
        workspaceId,
        userId,
        role: membership.role as 'ADMIN' | 'MEMBER' | 'VIEWER',
        accessType: 'direct',
      } satisfies WorkspaceAccess;
      return;
    }

    // Step 2: Hierarchical fallback — only applicable if workspace has ancestors
    const wsPath: string | undefined = (workspaceRow as any)?.path;
    if (wsPath && wsPath.includes('/')) {
      // Workspace has at least one ancestor; check if user is ADMIN of any of them
      const isAncestorAdmin = await hierarchyService.isAncestorAdmin(userId, wsPath, tenantContext);

      if (isAncestorAdmin) {
        // Grant read-only hierarchical access
        (request as any).workspaceAccess = {
          workspaceId,
          userId,
          role: 'HIERARCHICAL_READER',
          accessType: 'ancestor_admin',
        } satisfies WorkspaceAccess;
        return;
      }
    }

    // Step 3: No direct membership and no ancestor admin — deny
    return reply.code(403).send({
      error: {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have access to this workspace',
      },
    });
  } catch (error) {
    request.log.error(error, 'Error in workspace guard');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to validate workspace access',
      },
    });
  }
}

/**
 * Decorator to add workspace membership and access to FastifyRequest
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
    workspaceAccess?: WorkspaceAccess;
  }
}
