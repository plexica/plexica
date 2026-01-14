import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Workspace Role Guard Middleware Factory
 *
 * Creates a middleware that checks if the user has one of the required roles
 * in the current workspace.
 *
 * Must be used AFTER workspaceGuard to ensure workspaceMembership is set.
 *
 * @param requiredRoles - Array of roles that are allowed (e.g., ['ADMIN'])
 * @returns Fastify middleware function
 *
 * @example
 * // In route registration:
 * fastify.patch('/api/workspaces/:workspaceId',
 *   { preHandler: [tenantContextMiddleware, workspaceGuard, workspaceRoleGuard(['ADMIN'])] },
 *   workspaceController.update
 * );
 */
export function workspaceRoleGuard(requiredRoles: ('ADMIN' | 'MEMBER' | 'VIEWER')[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const membership = (request as any).workspaceMembership;

      if (!membership) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Workspace membership not found. Ensure workspaceGuard is applied first.',
        });
      }

      const hasRole = requiredRoles.includes(membership.role);

      if (!hasRole) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: `Insufficient permissions. Required role(s): ${requiredRoles.join(', ')}. Your role: ${membership.role}`,
        });
      }
    } catch (error) {
      request.log.error(error, 'Error in workspace role guard');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to validate workspace role',
      });
    }
  };
}

/**
 * Helper: Admin only guard
 */
export const workspaceAdminGuard = workspaceRoleGuard(['ADMIN']);

/**
 * Helper: Admin or Member guard
 */
export const workspaceMemberGuard = workspaceRoleGuard(['ADMIN', 'MEMBER']);

/**
 * Helper: Any workspace member (including viewers)
 */
export const workspaceAnyMemberGuard = workspaceRoleGuard(['ADMIN', 'MEMBER', 'VIEWER']);
