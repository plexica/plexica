/**
 * Tenant Admin Routes — T008-18, T008-64, T008-65 (Spec 008 Admin Interfaces)
 *
 * All routes are scoped to the authenticated tenant via `request.tenant`.
 * The tenant context is set by `tenantContextMiddleware` which reads the
 * X-Tenant-Slug header or JWT claim.
 *
 * Constitution Compliance:
 * - Article 1.2: Multi-Tenancy Isolation — all operations scoped to request.tenant
 * - Article 3.4: REST conventions, API versioning (mounted under /api/v1)
 * - Article 5.1: RBAC via requireTenantAdmin
 * - Article 6.2: Standard error format { error: { code, message, details? } }
 * - NFR-004: Audit log endpoint always uses context tenantId, ignores query params
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  tenantAdminService,
  DomainError,
  ROLE_PRIVILEGE_ORDER,
} from '../services/tenant-admin.service.js';
import { authMiddleware, requireTenantAdmin } from '../middleware/auth.js';
import { tenantContextMiddleware } from '../middleware/tenant-context.js';
import { getJobQueueServiceInstance } from '../modules/jobs/job-queue.singleton.js';
import { auditLogService } from '../services/audit-log.service.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const InviteUserSchema = z.object({
  email: z.string().email(),
  // roleId (UUID) is the canonical field; `role` (string name) is accepted as a
  // legacy / convenience alias used by tests and older clients.
  roleId: z.string().uuid().optional(),
  role: z.string().max(100).optional(),
  name: z.string().max(200).optional(),
});

const UpdateUserRoleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

const CreateTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  /** Optional: when absent the team is not scoped to a specific workspace. */
  workspaceId: z.string().uuid().optional(),
});

const UpdateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

const AddTeamMemberSchema = z.object({
  // Accept any non-empty string: user IDs come from Keycloak and may not be
  // standard UUIDs in all environments (e.g., test mocks).
  userId: z.string().min(1),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});

const UpdateTeamMemberSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});

const CreateRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

const UpdateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

// Query param schemas for GET routes (W7 fix — validated instead of raw cast)
const ListUsersQuerySchema = z.object({
  status: z.enum(['active', 'invited', 'deactivated']).optional(),
  // `role` is a role name (not UUID) — the service queries by r2.name in the EXISTS subquery.
  role: z.string().max(255).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const ListTeamsQuerySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const ListAuditLogsQuerySchema = z.object({
  action: z.string().max(100).optional(),
  resource_type: z.string().max(100).optional(),
  user_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Theme sub-schema (mirrors TenantThemeSchema in admin.ts — keep in sync)
const TenantThemeUpdateSchema = z.object({
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
});

// Settings sub-schema — arbitrary tenant preferences as a JSON blob
const TenantSettingsUpdateSchema = z.record(z.string(), z.unknown());

const UpdateSettingsSchema = z.object({
  /** Tenant display name */
  name: z.string().min(1).max(200).optional(),
  /** Theme overrides (logo, colors, font) — FR-013, US-006 AC-1 */
  theme: TenantThemeUpdateSchema.optional(),
  /** Arbitrary tenant preferences / integrations — FR-013 */
  settings: TenantSettingsUpdateSchema.optional(),
});

// ============================================================================
// TeamAuthGuard — ADR-024
// ============================================================================

/**
 * Keycloak realm-role → maximum allowed team_members.role rank.
 * Used by teamAuthGuard to enforce the subordination rule.
 *
 * Hierarchy (descending): OWNER(4) > ADMIN(3) > MEMBER(2) > VIEWER(1)
 */
function keycloakMaxRoleRank(roles: string[]): number {
  if (roles.includes('super_admin') || roles.includes('SUPER_ADMIN'))
    return ROLE_PRIVILEGE_ORDER.OWNER;
  if (
    roles.includes('tenant_owner') ||
    roles.includes('TENANT_OWNER') ||
    roles.includes('tenant_admin') ||
    roles.includes('TENANT_ADMIN')
  )
    return ROLE_PRIVILEGE_ORDER.OWNER;
  if (roles.includes('tenant_member') || roles.includes('TENANT_MEMBER'))
    return ROLE_PRIVILEGE_ORDER.MEMBER;
  return 0;
}

/**
 * TeamAuthGuard (ADR-024): validates that the caller is permitted to assign
 * or act on `requestedRole` within the given team.
 *
 * Effective max rank = min(keycloakMaxRank, callerStoredTeamRoleRank).
 * If the user is not yet a team member, their Keycloak realm ceiling is used.
 *
 * Returns an error response body on failure, or `null` on success.
 */
async function teamAuthGuard(
  request: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
  schemaName: string,
  teamId: string,
  requestedRole: string
): Promise<boolean> {
  const callerRoles: string[] = (request as any).user?.roles ?? [];
  const callerId: string = (request as any).user?.sub ?? '';

  // 1. Keycloak ceiling
  const kcMaxRank = keycloakMaxRoleRank(callerRoles);
  if (kcMaxRank === 0) {
    reply.status(403).send({
      error: {
        code: 'INSUFFICIENT_REALM_ROLE',
        message: 'You do not have sufficient realm role to perform team operations',
      },
    });
    return false;
  }

  // 2. Caller's stored team_members.role (if they are already a member)
  let callerStoredRank = kcMaxRank; // default: use Keycloak ceiling when not yet a member
  if (callerId) {
    const callerStoredRole = await tenantAdminService.getCallerTeamRole(
      schemaName,
      teamId,
      callerId
    );
    if (callerStoredRole !== null) {
      // min(keycloakMaxRank, storedRank) — subordination rule
      callerStoredRank = Math.min(kcMaxRank, ROLE_PRIVILEGE_ORDER[callerStoredRole] ?? 0);
    }
  }

  // 3. Effective max rank the caller may assign
  const effectiveMaxRank = callerStoredRank;
  const requestedRank = ROLE_PRIVILEGE_ORDER[requestedRole] ?? 0;

  if (requestedRank > effectiveMaxRank) {
    reply.status(400).send({
      error: {
        code: 'ROLE_EXCEEDS_REALM_ROLE',
        message: `You are not permitted to assign the '${requestedRole}' team role with your current realm role`,
      },
    });
    return false;
  }

  return true;
}

// ============================================================================
// Error helper
// ============================================================================

function sendError(
  reply: FastifyReply,
  code: string,
  message: string,
  statusCode: number,
  details?: Record<string, unknown>
) {
  return reply.status(statusCode).send({
    error: { code, message, ...(details ? { details } : {}) },
  });
}

function handleError(reply: FastifyReply, err: unknown) {
  if (err instanceof DomainError) {
    return sendError(reply, err.code, err.message, err.statusCode);
  }
  if (err instanceof z.ZodError) {
    return sendError(reply, 'VALIDATION_ERROR', 'Request validation failed', 400, {
      issues: err.issues,
    });
  }
  reply.log.error(err, 'Unexpected error in tenant-admin route');
  return sendError(reply, 'INTERNAL_ERROR', 'An unexpected error occurred', 500);
}

// ============================================================================
// Route plugin
// ============================================================================

export async function tenantAdminRoutes(fastify: FastifyInstance) {
  // Apply auth + tenant context + role guard to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', tenantContextMiddleware);
  fastify.addHook('preHandler', requireTenantAdmin);

  // --------------------------------------------------------------------------
  // Dashboard
  // --------------------------------------------------------------------------

  /**
   * GET /api/v1/tenant/dashboard
   * Returns high-level stats: total users, teams, active plugins.
   */
  fastify.get('/tenant/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const result = await tenantAdminService.getDashboard(tenantId, schemaName);
      return reply.status(200).send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------

  /**
   * GET /api/v1/tenant/users
   * List users in the tenant with optional filters.
   */
  fastify.get('/tenant/users', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const query = ListUsersQuerySchema.parse(request.query);
      const filters = {
        status: query.status,
        role: query.role,
        search: query.search,
        page: query.page,
        limit: query.limit,
      };
      const result = await tenantAdminService.listUsers(tenantId, schemaName, filters);
      return reply.status(200).send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  /**
   * POST /api/v1/tenant/users/invite
   * Invite a new user to the tenant.
   */
  fastify.post('/tenant/users/invite', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName, tenantSlug } = request.tenant!;
      const dto = InviteUserSchema.parse(request.body);
      const result = await tenantAdminService.inviteUser(tenantId, schemaName, tenantSlug, dto);
      return reply.status(201).send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  /**
   * PATCH /api/v1/tenant/users/:userId/role
   * Update a user's roles within the tenant.
   */
  fastify.patch(
    '/tenant/users/:userId/role',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = request.tenant!;
        const { userId } = request.params as { userId: string };
        const dto = UpdateUserRoleSchema.parse(request.body);
        const result = await tenantAdminService.updateUser(tenantId, schemaName, userId, dto);
        return reply.status(200).send(result);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  /**
   * POST /api/v1/tenant/users/:userId/deactivate
   * Deactivate a user (disables in Keycloak, sets status=deactivated).
   */
  fastify.post(
    '/tenant/users/:userId/deactivate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName, tenantSlug } = request.tenant!;
        const { userId } = request.params as { userId: string };
        const result = await tenantAdminService.deactivateUser(
          tenantId,
          schemaName,
          tenantSlug,
          userId
        );
        return reply.status(200).send(result);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  /**
   * POST /api/v1/tenant/users/:userId/reactivate
   * Re-activate a deactivated user.
   */
  fastify.post(
    '/tenant/users/:userId/reactivate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName, tenantSlug } = request.tenant!;
        const { userId } = request.params as { userId: string };
        const result = await tenantAdminService.reactivateUser(
          tenantId,
          schemaName,
          tenantSlug,
          userId
        );
        return reply.status(200).send(result);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  /**
   * POST /api/v1/tenant/users/:userId/resend-invitation
   * Resend an invitation email to a pending user.
   */
  fastify.post(
    '/tenant/users/:userId/resend-invitation',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName, tenantSlug } = request.tenant!;
        const { userId } = request.params as { userId: string };
        const result = await tenantAdminService.resendInvite(
          tenantId,
          schemaName,
          tenantSlug,
          userId
        );
        return reply.status(200).send(result);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  /**
   * POST /api/v1/tenant/users/:userId/cancel-invitation
   * Cancel a pending invitation.
   */
  fastify.post(
    '/tenant/users/:userId/cancel-invitation',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName, tenantSlug } = request.tenant!;
        const { userId } = request.params as { userId: string };
        const result = await tenantAdminService.cancelInvite(
          tenantId,
          schemaName,
          tenantSlug,
          userId
        );
        return reply.status(200).send(result);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Teams
  // --------------------------------------------------------------------------

  /**
   * GET /api/v1/tenant/teams
   * List teams in the tenant.
   */
  fastify.get('/tenant/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const query = ListTeamsQuerySchema.parse(request.query);
      const filters = {
        workspaceId: query.workspaceId,
        page: query.page,
        limit: query.limit,
      };
      const result = await tenantAdminService.listTeams(tenantId, schemaName, filters);
      return reply.status(200).send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  /**
   * POST /api/v1/tenant/teams
   * Create a new team.
   */
  fastify.post('/tenant/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const requestingUserId = (request as any).user?.sub ?? 'system';
      const dto = CreateTeamSchema.parse(request.body);
      const result = await tenantAdminService.createTeam(tenantId, schemaName, {
        ...dto,
        ownerId: requestingUserId,
      });
      return reply.status(201).send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  /**
   * PATCH /api/v1/tenant/teams/:teamId
   * Update a team's name or description.
   */
  fastify.patch('/tenant/teams/:teamId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const { teamId } = request.params as { teamId: string };
      const dto = UpdateTeamSchema.parse(request.body);
      const result = await tenantAdminService.updateTeam(tenantId, schemaName, teamId, dto);
      return reply.status(200).send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  /**
   * DELETE /api/v1/tenant/teams/:teamId
   * Delete a team and all its members.
   */
  fastify.delete('/tenant/teams/:teamId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const { teamId } = request.params as { teamId: string };
      await tenantAdminService.deleteTeam(tenantId, schemaName, teamId);
      return reply.status(204).send();
    } catch (err) {
      return handleError(reply, err);
    }
  });

  /**
   * POST /api/v1/tenant/teams/:teamId/members
   * Add a member to a team.
   *
   * TeamAuthGuard (ADR-024): effective max role = min(keycloakMaxRole,
   * callerStoredTeamRole). Callers can only assign a team role up to their
   * effective ceiling.
   */
  fastify.post(
    '/tenant/teams/:teamId/members',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = request.tenant!;
        const { teamId } = request.params as { teamId: string };
        const dto = AddTeamMemberSchema.parse(request.body);

        // ── TeamAuthGuard (ADR-024) ────────────────────────────────────────
        const allowed = await teamAuthGuard(request, reply, schemaName, teamId, dto.role);
        if (!allowed) return;
        // ──────────────────────────────────────────────────────────────────

        const result = await tenantAdminService.addTeamMember(tenantId, schemaName, teamId, dto);
        return reply.status(201).send(result);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  /**
   * PATCH /api/v1/tenant/teams/:teamId/members/:userId
   * Update the role of an existing team member.
   *
   * TeamAuthGuard (ADR-024): caller cannot elevate a member above their own
   * effective team role ceiling.
   */
  fastify.patch(
    '/tenant/teams/:teamId/members/:userId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = request.tenant!;
        const { teamId, userId } = request.params as { teamId: string; userId: string };
        const dto = UpdateTeamMemberSchema.parse(request.body);

        // ── TeamAuthGuard (ADR-024) ────────────────────────────────────────
        const allowed = await teamAuthGuard(request, reply, schemaName, teamId, dto.role);
        if (!allowed) return;
        // ──────────────────────────────────────────────────────────────────

        const result = await tenantAdminService.updateTeamMember(
          tenantId,
          schemaName,
          teamId,
          userId,
          dto
        );
        return reply.status(200).send(result);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  /**
   * DELETE /api/v1/tenant/teams/:teamId/members/:userId
   * Remove a member from a team.
   *
   * TeamAuthGuard (ADR-024): callers must have at least ADMIN effective role
   * to remove members (cannot remove members they couldn't have added).
   * We treat the "requested role" as ADMIN — the minimum privilege needed
   * to remove any member — which maps to rank 3.
   */
  fastify.delete(
    '/tenant/teams/:teamId/members/:userId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = request.tenant!;
        const { teamId, userId } = request.params as { teamId: string; userId: string };
        // ADR-024: callers must hold at least ADMIN effective role to remove members
        const allowed = await teamAuthGuard(request, reply, schemaName, teamId, 'ADMIN');
        if (!allowed) return;
        await tenantAdminService.removeTeamMember(tenantId, schemaName, teamId, userId);
        return reply.status(204).send();
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Roles
  // --------------------------------------------------------------------------

  /**
   * GET /api/v1/tenant/roles
   * List all roles (system + custom) with their permissions.
   */
  fastify.get('/tenant/roles', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const result = await tenantAdminService.listRoles(tenantId, schemaName);
      // Send the raw array so callers can use Array.isArray() on the response body.
      return reply.status(200).send(result.data);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  /**
   * POST /api/v1/tenant/roles
   * Create a custom role.
   */
  fastify.post('/tenant/roles', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const dto = CreateRoleSchema.parse(request.body);
      const result = await tenantAdminService.createRole(tenantId, schemaName, dto);
      // Custom roles created via this endpoint are never system roles.
      return reply.status(201).send({ ...result, isSystem: false });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  /**
   * PATCH /api/v1/tenant/roles/:roleId
   * Update a custom role (name, description, permissions).
   */
  fastify.patch('/tenant/roles/:roleId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const { roleId } = request.params as { roleId: string };
      const dto = UpdateRoleSchema.parse(request.body);
      const result = await tenantAdminService.updateRole(tenantId, schemaName, roleId, dto);
      return reply.status(200).send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  /**
   * DELETE /api/v1/tenant/roles/:roleId
   * Delete a custom role.
   */
  fastify.delete('/tenant/roles/:roleId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const { roleId } = request.params as { roleId: string };
      await tenantAdminService.deleteRole(tenantId, schemaName, roleId);
      return reply.status(204).send();
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // --------------------------------------------------------------------------
  // Permissions
  // --------------------------------------------------------------------------

  /**
   * GET /api/v1/tenant/permissions
   * List all available permissions in the tenant.
   */
  fastify.get('/tenant/permissions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, schemaName } = request.tenant!;
      const result = await tenantAdminService.listPermissions(tenantId, schemaName);
      // Return the permissions array directly (not the wrapper object) so callers
      // can use Array.isArray() on the response body.
      return reply.status(200).send(result.permissions ?? result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------

  /**
   * GET /api/v1/tenant/settings
   * Get current tenant settings.
   */
  fastify.get('/tenant/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId } = request.tenant!;
      const result = await tenantAdminService.getSettings(tenantId);
      return reply.status(200).send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  /**
   * PATCH /api/v1/tenant/settings
   * Update tenant settings.
   */
  fastify.patch('/tenant/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId } = request.tenant!;
      const dto = UpdateSettingsSchema.parse(request.body);
      const result = await tenantAdminService.updateSettings(tenantId, dto);
      return reply.status(200).send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // --------------------------------------------------------------------------
  // Audit Logs
  // --------------------------------------------------------------------------

  /**
   * GET /api/v1/tenant/audit-logs
   * Query audit logs scoped to the request tenant.
   *
   * NFR-004: tenant_id query parameter is intentionally IGNORED.
   * The tenantId is always taken from request.tenant to prevent cross-tenant
   * access via query parameter manipulation.
   */
  fastify.get('/tenant/audit-logs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId } = request.tenant!;
      const query = ListAuditLogsQuerySchema.parse(request.query);

      // NFR-004: Build filters from query params, but NEVER include tenant_id from query.
      // tenantId comes exclusively from the authenticated tenant context.
      const filters = {
        action: query.action,
        resourceType: query.resource_type,
        userId: query.user_id,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        page: query.page,
        limit: query.limit,
      };

      const result = await auditLogService.queryForTenant(tenantId, filters);
      return reply.status(200).send(result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // T008-66: POST /tenant/audit-logs/export
  // FR-015: Enqueue async tenant-scoped audit log export; returns 202 with jobId.
  // Note: tenantId is NOT accepted in body — always derived from auth context (plan §3.2.19b).
  const TenantAuditLogExportBodySchema = z.object({
    format: z.enum(['csv', 'json']),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    actions: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(50000).optional(),
  });

  fastify.post(
    '/tenant/audit-logs/export',
    {
      schema: {
        description: 'Enqueue a tenant-scoped asynchronous audit log export job (FR-015)',
        tags: ['tenant-admin', 'audit-logs'],
        body: {
          type: 'object',
          required: ['format'],
          properties: {
            format: { type: 'string', description: 'csv or json' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            actions: { type: 'array', items: { type: 'string' } },
            limit: { type: 'integer' },
          },
        },
        response: {
          202: {
            type: 'object',
            properties: {
              jobId: { type: 'string' },
              estimatedSeconds: { type: 'integer' },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: { code: { type: 'string' }, message: { type: 'string' } },
              },
            },
          },
          500: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: { code: { type: 'string' }, message: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenant?.tenantId;
      if (!tenantId) {
        return reply.code(400).send({
          error: { code: 'MISSING_TENANT_CONTEXT', message: 'Tenant context is required' },
        });
      }

      // Validate body
      const parseResult = TenantAuditLogExportBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        if (firstIssue?.path[0] === 'format') {
          return reply.code(400).send({
            error: {
              code: 'INVALID_EXPORT_FORMAT',
              message: 'format must be "csv" or "json"',
            },
          });
        }
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: firstIssue?.message ?? 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
      }

      const body = parseResult.data;
      const requestingUserId =
        (request.user as any)?.sub ?? (request.user as any)?.id ?? '__unknown__';

      try {
        const jobQueueService = getJobQueueServiceInstance();

        const { jobId } = await jobQueueService.enqueue({
          name: 'audit-log-export',
          tenantId,
          payload: {
            tenantId,
            format: body.format,
            ...(body.startDate && { startDate: body.startDate }),
            ...(body.endDate && { endDate: body.endDate }),
            ...(body.actions && { actions: body.actions }),
            ...(body.limit && { limit: body.limit }),
            requestedBy: requestingUserId,
          },
        });

        await auditLogService.log({
          action: 'audit_log.export_requested',
          userId: requestingUserId,
          tenantId,
          resourceType: 'audit_log',
          resourceId: jobId,
          details: {
            format: body.format,
            ...(body.startDate && { startDate: body.startDate }),
            ...(body.endDate && { endDate: body.endDate }),
          },
        });

        return reply.code(202).send({ jobId, estimatedSeconds: 15 });
      } catch (err) {
        request.log.error({ err }, 'Failed to enqueue tenant audit log export job');
        return reply.code(500).send({
          error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to enqueue export job' },
        });
      }
    }
  );
}
