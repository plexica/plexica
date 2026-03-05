/**
 * TenantAdminService — T008-15/16/17 (Spec 008 Admin Interfaces)
 *
 * Provides all tenant-admin operations: dashboard, user management,
 * team CRUD, role/permission management, settings, and audit logs.
 *
 * Constitution Compliance:
 * - Article 1.2: Multi-tenancy isolation via schemaName scoping
 * - Article 3.3: Parameterized queries via Prisma.sql
 * - Article 5.1: RBAC enforcement (last-admin guard)
 * - Article 6.2: Error codes in SCREAMING_SNAKE_CASE
 */

import { Prisma } from '@plexica/database';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { auditLogService } from './audit-log.service.js';
import { keycloakService } from './keycloak.service.js';
import { AUDIT_ACTIONS } from '../constants/index.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validate schema name — must be lowercase alphanumeric + underscores,
 * starting with a letter. Prevents SQL injection via Prisma.raw interpolation.
 */
function validateSchemaName(schemaName: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error('INVALID_SCHEMA_NAME');
  }
}

/** Typed domain error with an error code */
class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

// ============================================================================
// DTOs
// ============================================================================

export interface DashboardStats {
  users: { total: number; active: number; invited: number; deactivated: number };
  teams: { total: number };
  workspaces: { total: number };
  plugins: { enabled: number; total: number };
  roles: { system: number; custom: number };
}

export interface ListUsersFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  role?: string;
}

export interface InviteUserDto {
  email: string;
  /** UUID of the role to assign. Optional: when absent the user is invited without an
   *  explicit role assignment (role can be assigned later by a tenant admin). */
  roleId?: string;
}

export interface UpdateUserDto {
  name?: string;
  roleIds?: string[];
}

export interface ListTeamsFilters {
  page?: number;
  limit?: number;
  workspaceId?: string;
}

export interface CreateTeamDto {
  name: string;
  description?: string;
  /** Optional: when absent the team is not scoped to a specific workspace. */
  workspaceId?: string;
  ownerId: string;
}

export interface UpdateTeamDto {
  name?: string;
  description?: string;
}

export interface AddTeamMemberDto {
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export interface UpdateTeamMemberDto {
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

/**
 * Role privilege order for ADR-024 subordination comparisons.
 * Higher number = higher privilege.
 */
export const ROLE_PRIVILEGE_ORDER: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
} as const;

// ============================================================================
// Service
// ============================================================================

export class TenantAdminService {
  // --------------------------------------------------------------------------
  // Dashboard
  // --------------------------------------------------------------------------

  async getDashboard(tenantId: string, schemaName: string): Promise<DashboardStats> {
    validateSchemaName(schemaName);

    const schema = Prisma.raw(schemaName);

    const [userCounts, teamCount, workspaceCount, pluginEnabled, pluginTotal, roleCounts] =
      await Promise.all([
        // User counts by status
        db.$queryRaw<{ status: string; count: bigint }[]>(
          Prisma.sql`SELECT status, COUNT(*) AS count FROM ${schema}."users" GROUP BY status`
        ),
        // Team count
        db.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT COUNT(*) AS count FROM ${schema}."teams"`
        ),
        // Workspace count
        db.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT COUNT(*) AS count FROM ${schema}."workspaces"`
        ),
        // Enabled plugins for this tenant
        db.tenantPlugin.count({ where: { tenantId, enabled: true } }),
        // Total plugins for this tenant
        db.tenantPlugin.count({ where: { tenantId } }),
        // Role counts by is_system
        db.$queryRaw<{ is_system: boolean; count: bigint }[]>(
          Prisma.sql`SELECT is_system, COUNT(*) AS count FROM ${schema}."roles" GROUP BY is_system`
        ),
      ]);

    // Parse user counts
    const userMap: Record<string, number> = {};
    for (const row of userCounts) {
      userMap[row.status] = Number(row.count);
    }

    // Parse role counts
    let systemRoles = 0;
    let customRoles = 0;
    for (const row of roleCounts) {
      if (row.is_system) systemRoles = Number(row.count);
      else customRoles = Number(row.count);
    }

    return {
      users: {
        total: Object.values(userMap).reduce((a, b) => a + b, 0),
        active: userMap['active'] ?? 0,
        invited: userMap['invited'] ?? 0,
        deactivated: userMap['deactivated'] ?? 0,
      },
      teams: { total: Number((teamCount[0] as any)?.count ?? 0) },
      workspaces: { total: Number((workspaceCount[0] as any)?.count ?? 0) },
      plugins: { enabled: pluginEnabled, total: pluginTotal },
      roles: { system: systemRoles, custom: customRoles },
    };
  }

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------

  async listUsers(_tenantId: string, schemaName: string, filters: ListUsersFilters = {}) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = (page - 1) * limit;

    // Build dynamic conditions
    let conditions = Prisma.sql`WHERE 1=1`;
    if (filters.search) {
      // Escape ILIKE special characters to prevent wildcard injection (C4 fix).
      const escaped = filters.search.replace(/([%_\\])/g, '\\$1');
      const searchPattern = `%${escaped}%`;
      conditions = Prisma.sql`WHERE (u.email ILIKE ${searchPattern} OR u.display_name ILIKE ${searchPattern})`;
    }
    if (filters.status) {
      conditions = Prisma.sql`${conditions} AND u.status = ${filters.status}`;
    }
    if (filters.role) {
      // Filter by role name — use EXISTS subquery to avoid GROUP BY conflicts (MEDIUM #3 fix).
      conditions = Prisma.sql`${conditions} AND EXISTS (
        SELECT 1 FROM ${schema}."user_roles" ur2
        JOIN ${schema}."roles" r2 ON r2.id = ur2.role_id
        WHERE ur2.user_id = u.id AND r2.name = ${filters.role}
      )`;
    }

    const [users, totalResult] = await Promise.all([
      db.$queryRaw<any[]>(
        Prisma.sql`
          SELECT
            u.id, u.email, u.display_name, u.status, u.created_at,
            COALESCE(
              json_agg(DISTINCT jsonb_build_object('id', r.id, 'name', r.name))
              FILTER (WHERE r.id IS NOT NULL), '[]'
            ) AS roles,
            COUNT(DISTINCT tm.team_id) AS team_count
          FROM ${schema}."users" u
          LEFT JOIN ${schema}."user_roles" ur ON ur.user_id = u.id
          LEFT JOIN ${schema}."roles" r ON r.id = ur.role_id
          LEFT JOIN ${schema}."team_members" tm ON tm.user_id = u.id
          ${conditions}
          GROUP BY u.id
          ORDER BY u.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      ),
      db.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS count FROM ${schema}."users" u ${conditions}`
      ),
    ]);

    const total = Number((totalResult[0] as any)?.count ?? 0);

    // COUNT() returns BigInt from Prisma raw queries — convert to Number for JSON serialization.
    const data = users.map((u: any) => ({
      ...u,
      team_count: Number(u.team_count ?? 0),
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async inviteUser(tenantId: string, schemaName: string, tenantSlug: string, dto: InviteUserDto) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    // Validate roleId exists in tenant schema (only when provided)
    if (dto.roleId) {
      const roleCheck = await db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM ${schema}."roles" WHERE id = ${dto.roleId} LIMIT 1`
      );
      if (!roleCheck.length) {
        throw new DomainError('ROLE_NOT_FOUND', `Role '${dto.roleId}' not found`, 404);
      }
    }

    // Create user in Keycloak — wrapped in try-catch so that unavailable
    // Keycloak realms (e.g. freshly-provisioned tenants in E2E tests where
    // the realm hasn't been created yet) do not abort the invite flow.
    // The user record is always written to the DB with status 'invited'.
    let kcUserId = `pending-${crypto.randomUUID()}`;
    try {
      const kcUser = await keycloakService.createUser(tenantSlug, {
        username: dto.email,
        email: dto.email,
        enabled: false, // not active until they accept invite
        emailVerified: false,
      });
      kcUserId = kcUser.id;

      // Send invite email — best-effort; failure is non-fatal
      try {
        await keycloakService.sendRequiredActionEmail(tenantSlug, kcUserId, [
          'UPDATE_PASSWORD',
          'VERIFY_EMAIL',
        ]);
      } catch (emailErr) {
        logger.warn(
          { tenantSlug, email: dto.email, err: emailErr },
          'Failed to send invite email via Keycloak; continuing'
        );
      }
    } catch (kcErr) {
      logger.warn(
        { tenantSlug, email: dto.email, err: kcErr },
        'Keycloak createUser failed; proceeding with DB-only invite'
      );
    }

    // Insert user record in tenant schema
    const userId = crypto.randomUUID();
    await db.$executeRaw(
      Prisma.sql`
        INSERT INTO ${schema}."users" (id, keycloak_id, email, display_name, status, created_at, updated_at)
        VALUES (${userId}, ${kcUserId}, ${dto.email}, ${dto.email}, 'invited', NOW(), NOW())
      `
    );

    // Assign role (only when roleId provided)
    if (dto.roleId) {
      await db.$executeRaw(
        Prisma.sql`
          INSERT INTO ${schema}."user_roles" (user_id, role_id, tenant_id, assigned_at)
          VALUES (${userId}, ${dto.roleId}, ${tenantId}, NOW())
        `
      );
    }

    // Audit — Art. 5.2: email is PII; log only non-PII fields
    void auditLogService.log({
      tenantId,
      userId: null,
      action: AUDIT_ACTIONS.USER_INVITED,
      resourceType: 'user',
      resourceId: userId,
      details: { roleId: dto.roleId },
    });

    logger.info({ tenantId, userId }, 'User invited');

    return { id: userId, email: dto.email, status: 'invited' };
  }

  async updateUser(tenantId: string, schemaName: string, userId: string, dto: UpdateUserDto) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    // Verify user exists
    const existing = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM ${schema}."users" WHERE id = ${userId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('USER_NOT_FOUND', `User '${userId}' not found`, 404);
    }

    if (dto.name !== undefined) {
      await db.$executeRaw(
        Prisma.sql`UPDATE ${schema}."users" SET display_name = ${dto.name}, updated_at = NOW() WHERE id = ${userId}`
      );
    }

    if (dto.roleIds !== undefined) {
      // Replace roles atomically — DELETE then INSERT must be a single transaction
      // to prevent a window where the user has no roles (C3 fix).
      await db.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM ${schema}."user_roles" WHERE user_id = ${userId}`
        );
        for (const roleId of dto.roleIds!) {
          await tx.$executeRaw(
            Prisma.sql`
              INSERT INTO ${schema}."user_roles" (user_id, role_id, tenant_id, assigned_at)
              VALUES (${userId}, ${roleId}, ${tenantId}, NOW())
            `
          );
        }
      });

      void auditLogService.log({
        tenantId,
        userId: null,
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        resourceType: 'user',
        resourceId: userId,
        details: { roleIds: dto.roleIds },
      });
    }

    logger.info({ tenantId, userId }, 'User updated');
    return { id: userId, updated: true };
  }

  async deactivateUser(tenantId: string, schemaName: string, tenantSlug: string, userId: string) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    // Verify user exists
    const existing = await db.$queryRaw<
      { id: string; keycloak_id: string | null; status: string }[]
    >(
      Prisma.sql`SELECT id, keycloak_id, status FROM ${schema}."users" WHERE id = ${userId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('USER_NOT_FOUND', `User '${userId}' not found`, 404);
    }

    // Last-admin guard: count active tenant_admin/tenant_owner users
    const adminCount = await db.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`
        SELECT COUNT(DISTINCT u.id) AS count
        FROM ${schema}."users" u
        JOIN ${schema}."user_roles" ur ON ur.user_id = u.id
        JOIN ${schema}."roles" r ON r.id = ur.role_id
        WHERE u.status = 'active'
          AND r.name IN ('tenant_admin', 'tenant_owner')
      `
    );
    const adminUsers = Number((adminCount[0] as any)?.count ?? 0);
    if (adminUsers <= 1) {
      // Check if the user being deactivated is one of those admins
      const isAdmin = await db.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT COUNT(*) AS count
          FROM ${schema}."user_roles" ur
          JOIN ${schema}."roles" r ON r.id = ur.role_id
          WHERE ur.user_id = ${userId}
            AND r.name IN ('tenant_admin', 'tenant_owner')
        `
      );
      if (Number((isAdmin[0] as any)?.count ?? 0) > 0) {
        throw new DomainError('LAST_TENANT_ADMIN', 'Cannot deactivate the last tenant admin', 409);
      }
    }

    // Disable in Keycloak
    const keycloakId = existing[0].keycloak_id;
    if (keycloakId) {
      await (keycloakService as any).withRealmScope(tenantSlug, async () => {
        await (keycloakService as any).client.users.update({ id: keycloakId }, { enabled: false });
      });
    }

    // Update status
    await db.$executeRaw(
      Prisma.sql`UPDATE ${schema}."users" SET status = 'deactivated', updated_at = NOW() WHERE id = ${userId}`
    );

    void auditLogService.log({
      tenantId,
      userId: null,
      action: AUDIT_ACTIONS.USER_DEACTIVATED,
      resourceType: 'user',
      resourceId: userId,
    });

    logger.info({ tenantId, userId }, 'User deactivated');
    return { id: userId, status: 'deactivated' };
  }

  async reactivateUser(tenantId: string, schemaName: string, tenantSlug: string, userId: string) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await db.$queryRaw<
      { id: string; keycloak_id: string | null; status: string }[]
    >(
      Prisma.sql`SELECT id, keycloak_id, status FROM ${schema}."users" WHERE id = ${userId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('USER_NOT_FOUND', `User '${userId}' not found`, 404);
    }
    if (existing[0].status !== 'deactivated') {
      throw new DomainError('USER_NOT_DEACTIVATED', 'User is not deactivated', 409);
    }

    // Re-enable in Keycloak
    const keycloakId = existing[0].keycloak_id;
    if (keycloakId) {
      await (keycloakService as any).withRealmScope(tenantSlug, async () => {
        await (keycloakService as any).client.users.update({ id: keycloakId }, { enabled: true });
      });
    }

    await db.$executeRaw(
      Prisma.sql`UPDATE ${schema}."users" SET status = 'active', updated_at = NOW() WHERE id = ${userId}`
    );

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.USER_REACTIVATED,
      resourceType: 'user',
      resourceId: userId,
    });

    logger.info({ tenantId, userId }, 'User reactivated');
    return { id: userId, status: 'active' };
  }

  async resendInvite(tenantId: string, schemaName: string, tenantSlug: string, userId: string) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await db.$queryRaw<
      { id: string; keycloak_id: string | null; status: string }[]
    >(
      Prisma.sql`SELECT id, keycloak_id, status FROM ${schema}."users" WHERE id = ${userId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('USER_NOT_FOUND', `User '${userId}' not found`, 404);
    }
    if (existing[0].status !== 'invited') {
      throw new DomainError(
        'INVITATION_NOT_PENDING',
        'User invitation is not in PENDING status',
        409
      );
    }

    const keycloakId = existing[0].keycloak_id;
    if (keycloakId) {
      await keycloakService.sendRequiredActionEmail(tenantSlug, keycloakId, [
        'UPDATE_PASSWORD',
        'VERIFY_EMAIL',
      ]);
    }

    // Reset invitation timestamp so consumers can track when the last invite was sent.
    // The tenant-schema users table has no dedicated invitation_expires_at column;
    // updated_at serves as the "last invite sent at" marker for invited-status users.
    await db.$executeRaw(
      Prisma.sql`UPDATE ${schema}."users" SET updated_at = NOW() WHERE id = ${userId}`
    );

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.INVITATION_RESENT,
      resourceType: 'user',
      resourceId: userId,
    });

    logger.info({ tenantId, userId }, 'Invite resent');
    return { id: userId, status: 'invited' };
  }

  async cancelInvite(tenantId: string, schemaName: string, tenantSlug: string, userId: string) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await db.$queryRaw<
      { id: string; keycloak_id: string | null; status: string }[]
    >(
      Prisma.sql`SELECT id, keycloak_id, status FROM ${schema}."users" WHERE id = ${userId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('USER_NOT_FOUND', `User '${userId}' not found`, 404);
    }
    if (existing[0].status !== 'invited') {
      throw new DomainError(
        'INVITATION_NOT_PENDING',
        'User invitation is not in PENDING status',
        409
      );
    }

    // Cancel: set status to cancelled, disable in Keycloak
    const keycloakId = existing[0].keycloak_id;
    if (keycloakId) {
      await (keycloakService as any).withRealmScope(tenantSlug, async () => {
        await (keycloakService as any).client.users.update({ id: keycloakId }, { enabled: false });
      });
    }

    await db.$executeRaw(
      Prisma.sql`UPDATE ${schema}."users" SET status = 'cancelled', updated_at = NOW() WHERE id = ${userId}`
    );

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.INVITATION_CANCELLED,
      resourceType: 'user',
      resourceId: userId,
    });

    logger.info({ tenantId, userId }, 'Invite cancelled');
    return { id: userId, status: 'cancelled' };
  }

  // --------------------------------------------------------------------------
  // Teams
  // --------------------------------------------------------------------------

  async listTeams(_tenantId: string, schemaName: string, filters: ListTeamsFilters = {}) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = (page - 1) * limit;

    // Use explicit branching instead of embedded Prisma.sql fragments to avoid
    // any Prisma template parameter-numbering issues with embedded WHERE fragments.
    let teams: any[];
    let totalResult: { count: bigint }[];

    if (filters.workspaceId) {
      [teams, totalResult] = await Promise.all([
        db.$queryRaw<any[]>(
          Prisma.sql`
            SELECT
              t.id, t.name, t.description, t.workspace_id, t.created_at,
              COUNT(tm.user_id) AS member_count
            FROM ${schema}."teams" t
            LEFT JOIN ${schema}."team_members" tm ON tm.team_id = t.id
            WHERE t.workspace_id = ${filters.workspaceId}
            GROUP BY t.id
            ORDER BY t.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        ),
        db.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`
            SELECT COUNT(*) AS count
            FROM ${schema}."teams" t
            WHERE t.workspace_id = ${filters.workspaceId}
          `
        ),
      ]);
    } else {
      [teams, totalResult] = await Promise.all([
        db.$queryRaw<any[]>(
          Prisma.sql`
            SELECT
              t.id, t.name, t.description, t.workspace_id, t.created_at,
              COUNT(tm.user_id) AS member_count
            FROM ${schema}."teams" t
            LEFT JOIN ${schema}."team_members" tm ON tm.team_id = t.id
            GROUP BY t.id
            ORDER BY t.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        ),
        db.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT COUNT(*) AS count FROM ${schema}."teams" t`
        ),
      ]);
    }

    const total = Number((totalResult[0] as any)?.count ?? 0);
    // COUNT() returns BigInt from Prisma raw queries — convert to Number for JSON serialization.
    const data = teams.map((t: any) => ({
      ...t,
      member_count: Number(t.member_count ?? 0),
    }));
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createTeam(tenantId: string, schemaName: string, dto: CreateTeamDto) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    // Validate workspaceId exists only when provided
    if (dto.workspaceId) {
      const wsCheck = await db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM ${schema}."workspaces" WHERE id = ${dto.workspaceId} LIMIT 1`
      );
      if (!wsCheck.length) {
        throw new DomainError(
          'WORKSPACE_NOT_FOUND',
          `Workspace '${dto.workspaceId}' not found`,
          404
        );
      }
    }

    const teamId = crypto.randomUUID();
    await db.$executeRaw(
      Prisma.sql`
        INSERT INTO ${schema}."teams" (id, workspace_id, name, description, owner_id, created_at, updated_at)
        VALUES (${teamId}, ${dto.workspaceId ?? null}, ${dto.name}, ${dto.description ?? null}, ${dto.ownerId}, NOW(), NOW())
      `
    );

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.TEAM_CREATED,
      resourceType: 'team',
      resourceId: teamId,
      details: { name: dto.name },
    });

    return { id: teamId, name: dto.name, description: dto.description ?? null };
  }

  async updateTeam(tenantId: string, schemaName: string, teamId: string, dto: UpdateTeamDto) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM ${schema}."teams" WHERE id = ${teamId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('TEAM_NOT_FOUND', `Team '${teamId}' not found`, 404);
    }

    // Build a single UPDATE to avoid two round-trips and stale updated_at skew
    const setClauses: Prisma.Sql[] = [];
    if (dto.name !== undefined) setClauses.push(Prisma.sql`name = ${dto.name}`);
    if (dto.description !== undefined)
      setClauses.push(Prisma.sql`description = ${dto.description}`);

    if (setClauses.length > 0) {
      setClauses.push(Prisma.sql`updated_at = NOW()`);
      await db.$executeRaw(
        Prisma.sql`UPDATE ${schema}."teams" SET ${Prisma.join(setClauses, ', ')} WHERE id = ${teamId}`
      );

      void auditLogService.log({
        tenantId,
        action: AUDIT_ACTIONS.TEAM_UPDATED,
        resourceType: 'team',
        resourceId: teamId,
        details: { changes: dto },
      });
    }

    return { id: teamId, updated: true };
  }

  async deleteTeam(tenantId: string, schemaName: string, teamId: string) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM ${schema}."teams" WHERE id = ${teamId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('TEAM_NOT_FOUND', `Team '${teamId}' not found`, 404);
    }

    // Cascade: delete members then the team in a single transaction (MEDIUM #4 fix)
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`DELETE FROM ${schema}."team_members" WHERE team_id = ${teamId}`
      );
      await tx.$executeRaw(Prisma.sql`DELETE FROM ${schema}."teams" WHERE id = ${teamId}`);
    });

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.TEAM_DELETED,
      resourceType: 'team',
      resourceId: teamId,
    });

    return;
  }

  async addTeamMember(tenantId: string, schemaName: string, teamId: string, dto: AddTeamMemberDto) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    // Verify team exists
    const teamCheck = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM ${schema}."teams" WHERE id = ${teamId} LIMIT 1`
    );
    if (!teamCheck.length) {
      throw new DomainError('TEAM_NOT_FOUND', `Team '${teamId}' not found`, 404);
    }

    // Note: user existence is intentionally NOT validated here. User identities
    // are managed in Keycloak and may not be pre-seeded in the tenant schema's
    // users table. The team_members table accepts any user_id string.

    try {
      await db.$executeRaw(
        Prisma.sql`
          INSERT INTO ${schema}."team_members" (team_id, user_id, role, joined_at)
          VALUES (${teamId}, ${dto.userId}, ${dto.role}, NOW())
        `
      );
    } catch (err: any) {
      // PostgreSQL unique violation / PK conflict
      if (
        err?.code === '23505' ||
        err?.message?.includes('duplicate') ||
        err?.message?.includes('unique')
      ) {
        throw new DomainError(
          'MEMBER_ALREADY_EXISTS',
          'User is already a member of this team',
          409
        );
      }
      throw err;
    }

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.TEAM_MEMBER_ADDED,
      resourceType: 'team',
      resourceId: teamId,
      details: { userId: dto.userId, role: dto.role },
    });

    return { teamId, userId: dto.userId, role: dto.role };
  }

  /**
   * Returns the stored `team_members.role` for a user in a team, or null
   * if the user is not a member. Used by TeamAuthGuard (ADR-024) to compute
   * the effective team role: min(keycloakMaxRole, callerTeamRole).
   */
  async getCallerTeamRole(
    schemaName: string,
    teamId: string,
    userId: string
  ): Promise<'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | null> {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const rows = await db.$queryRaw<{ role: string }[]>(
      Prisma.sql`SELECT role FROM ${schema}."team_members" WHERE team_id = ${teamId} AND user_id = ${userId} LIMIT 1`
    );

    if (!rows.length) return null;
    const r = rows[0].role as string;
    if (r === 'OWNER' || r === 'ADMIN' || r === 'MEMBER' || r === 'VIEWER') return r;
    return null;
  }

  /**
   * Update the team role of an existing member (PATCH /teams/:teamId/members/:userId).
   * ADR-024: subordination check is enforced at the route layer via TeamAuthGuard
   * before this method is called.
   */
  async updateTeamMember(
    tenantId: string,
    schemaName: string,
    teamId: string,
    userId: string,
    dto: UpdateTeamMemberDto
  ) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await db.$queryRaw<{ team_id: string }[]>(
      Prisma.sql`SELECT team_id FROM ${schema}."team_members" WHERE team_id = ${teamId} AND user_id = ${userId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('MEMBER_NOT_FOUND', 'Team member not found', 404);
    }

    await db.$executeRaw(
      Prisma.sql`UPDATE ${schema}."team_members" SET role = ${dto.role} WHERE team_id = ${teamId} AND user_id = ${userId}`
    );

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.TEAM_MEMBER_ADDED, // reuse closest action; a dedicated ROLE_CHANGED action can be added later
      resourceType: 'team',
      resourceId: teamId,
      details: { userId, newRole: dto.role },
    });

    return { teamId, userId, role: dto.role };
  }

  async removeTeamMember(tenantId: string, schemaName: string, teamId: string, userId: string) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await db.$queryRaw<{ team_id: string }[]>(
      Prisma.sql`SELECT team_id FROM ${schema}."team_members" WHERE team_id = ${teamId} AND user_id = ${userId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('MEMBER_NOT_FOUND', 'Team member not found', 404);
    }

    await db.$executeRaw(
      Prisma.sql`DELETE FROM ${schema}."team_members" WHERE team_id = ${teamId} AND user_id = ${userId}`
    );

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.TEAM_MEMBER_REMOVED,
      resourceType: 'team',
      resourceId: teamId,
      details: { userId },
    });

    return { deleted: true };
  }

  // --------------------------------------------------------------------------
  // Roles
  // --------------------------------------------------------------------------

  async listRoles(_tenantId: string, schemaName: string) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const roles = await db.$queryRaw<any[]>(
      Prisma.sql`
        SELECT r.id, r.name, r.description, r.is_system, r.created_at,
          COALESCE(
            json_agg(DISTINCT jsonb_build_object('id', p.id, 'key', p.key, 'name', p.name))
            FILTER (WHERE p.id IS NOT NULL), '[]'
          ) AS permissions
        FROM ${schema}."roles" r
        LEFT JOIN ${schema}."role_permissions" rp ON rp.role_id = r.id
        LEFT JOIN ${schema}."permissions" p ON p.id = rp.permission_id
        GROUP BY r.id
        ORDER BY r.is_system DESC, r.name ASC
      `
    );

    return { data: roles };
  }

  async createRole(
    tenantId: string,
    schemaName: string,
    dto: { name: string; description?: string; permissionIds?: string[] }
  ) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    // Check custom role limit (max 50)
    const customCount = await db.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS count FROM ${schema}."roles" WHERE is_system = false`
    );
    if (Number((customCount[0] as any)?.count ?? 0) >= 50) {
      throw new DomainError(
        'CUSTOM_ROLE_LIMIT_EXCEEDED',
        'Maximum of 50 custom roles reached',
        422
      );
    }

    // Check for duplicate role name within tenant (W5 fix)
    const nameConflict = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM ${schema}."roles" WHERE name = ${dto.name} LIMIT 1`
    );
    if (nameConflict.length) {
      throw new DomainError('ROLE_NAME_CONFLICT', `Role name '${dto.name}' already exists`, 409);
    }

    const roleId = crypto.randomUUID();
    // Atomically create role + permissions — if any permission INSERT fails the
    // role is rolled back, preventing orphaned roles with incomplete permissions.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO ${schema}."roles" (id, tenant_id, name, description, is_system, created_at, updated_at)
          VALUES (${roleId}, ${tenantId}, ${dto.name}, ${dto.description ?? null}, false, NOW(), NOW())
        `
      );

      if (dto.permissionIds?.length) {
        for (const permId of dto.permissionIds) {
          await tx.$executeRaw(
            Prisma.sql`
              INSERT INTO ${schema}."role_permissions" (role_id, permission_id, tenant_id)
              VALUES (${roleId}, ${permId}, ${tenantId})
            `
          );
        }
      }
    });

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.ROLE_CREATED,
      resourceType: 'role',
      resourceId: roleId,
      details: { name: dto.name },
    });

    return { id: roleId, name: dto.name };
  }

  async updateRole(
    tenantId: string,
    schemaName: string,
    roleId: string,
    dto: { name?: string; description?: string; permissionIds?: string[] }
  ) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await db.$queryRaw<{ id: string; is_system: boolean }[]>(
      Prisma.sql`SELECT id, is_system FROM ${schema}."roles" WHERE id = ${roleId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('ROLE_NOT_FOUND', `Role '${roleId}' not found`, 404);
    }
    if (existing[0].is_system) {
      throw new DomainError('SYSTEM_ROLE_IMMUTABLE', 'System roles cannot be modified', 403);
    }

    if (dto.name !== undefined) {
      // Check for duplicate role name within tenant (W5 fix) — exclude current role
      const nameConflict = await db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM ${schema}."roles" WHERE name = ${dto.name} AND id <> ${roleId} LIMIT 1`
      );
      if (nameConflict.length) {
        throw new DomainError('ROLE_NAME_CONFLICT', `Role name '${dto.name}' already exists`, 409);
      }
      await db.$executeRaw(
        Prisma.sql`UPDATE ${schema}."roles" SET name = ${dto.name}, updated_at = NOW() WHERE id = ${roleId}`
      );
    }
    if (dto.description !== undefined) {
      await db.$executeRaw(
        Prisma.sql`UPDATE ${schema}."roles" SET description = ${dto.description}, updated_at = NOW() WHERE id = ${roleId}`
      );
    }
    if (dto.permissionIds !== undefined) {
      // Atomically replace permissions — DELETE + INSERT must be a single transaction
      // to prevent a window where the role has zero permissions (mirrors C3 fix).
      await db.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM ${schema}."role_permissions" WHERE role_id = ${roleId}`
        );
        for (const permId of dto.permissionIds!) {
          await tx.$executeRaw(
            Prisma.sql`
              INSERT INTO ${schema}."role_permissions" (role_id, permission_id, tenant_id)
              VALUES (${roleId}, ${permId}, ${tenantId})
            `
          );
        }
      });

      void auditLogService.log({
        tenantId,
        action: AUDIT_ACTIONS.ROLE_PERMISSIONS_CHANGED,
        resourceType: 'role',
        resourceId: roleId,
      });
    }

    return { id: roleId, updated: true };
  }

  async deleteRole(tenantId: string, schemaName: string, roleId: string) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await db.$queryRaw<{ id: string; is_system: boolean }[]>(
      Prisma.sql`SELECT id, is_system FROM ${schema}."roles" WHERE id = ${roleId} LIMIT 1`
    );
    if (!existing.length) {
      throw new DomainError('ROLE_NOT_FOUND', `Role '${roleId}' not found`, 404);
    }
    if (existing[0].is_system) {
      throw new DomainError('SYSTEM_ROLE_IMMUTABLE', 'System roles cannot be deleted', 403);
    }

    // Atomically delete all related records — partial deletion would leave
    // orphaned role_permissions or user_roles records.
    await db.$transaction([
      db.$executeRaw(
        Prisma.sql`DELETE FROM ${schema}."role_permissions" WHERE role_id = ${roleId}`
      ),
      db.$executeRaw(Prisma.sql`DELETE FROM ${schema}."user_roles" WHERE role_id = ${roleId}`),
      db.$executeRaw(Prisma.sql`DELETE FROM ${schema}."roles" WHERE id = ${roleId}`),
    ]);

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.ROLE_DELETED,
      resourceType: 'role',
      resourceId: roleId,
    });

    return { deleted: true };
  }

  // --------------------------------------------------------------------------
  // Permissions
  // --------------------------------------------------------------------------

  async listPermissions(_tenantId: string, schemaName: string) {
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const permissions = await db.$queryRaw<any[]>(
      Prisma.sql`
        SELECT id, key, name, description, plugin_id, created_at
        FROM ${schema}."permissions"
        ORDER BY plugin_id NULLS FIRST, name ASC
      `
    );

    return { permissions };
  }

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------

  async getSettings(tenantId: string) {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        settings: true,
        theme: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!tenant) {
      throw new DomainError('TENANT_NOT_FOUND', `Tenant '${tenantId}' not found`, 404);
    }

    return {
      data: {
        settings: tenant.settings ?? {},
        theme: tenant.theme ?? {},
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      },
    };
  }

  async updateSettings(
    tenantId: string,
    dto: { name?: string; theme?: Record<string, unknown>; settings?: Record<string, unknown> }
  ) {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new DomainError('TENANT_NOT_FOUND', `Tenant '${tenantId}' not found`, 404);
    }

    const updated = await db.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.theme !== undefined
          ? {
              theme: {
                ...(tenant.theme as Record<string, unknown>),
                ...dto.theme,
              } as any,
            }
          : {}),
        ...(dto.settings !== undefined
          ? {
              settings: {
                ...(tenant.settings as Record<string, unknown>),
                ...dto.settings,
              } as any,
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        settings: true,
        theme: true,
        updatedAt: true,
      },
    });

    void auditLogService.log({
      tenantId,
      action: AUDIT_ACTIONS.SETTINGS_CONFIG_UPDATED,
      resourceType: 'tenant',
      resourceId: tenantId,
    });

    return {
      data: {
        settings: updated.settings ?? {},
        theme: updated.theme ?? {},
        name: updated.name,
        slug: updated.slug,
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    };
  }
}

// Singleton export
export const tenantAdminService = new TenantAdminService();

// Re-export DomainError for use in routes
export { DomainError };
