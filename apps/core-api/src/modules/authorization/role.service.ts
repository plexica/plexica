// apps/core-api/src/modules/authorization/role.service.ts
//
// RBAC role management service.
// Spec 003 FR-003–FR-006, FR-018, FR-019, NFR-009, Edge Cases #1, #2, #8, #9, #10, Task 2.2
//
// Constitution Compliance:
//   - Article 1.2: Tenant isolation — all queries scoped to tenantId
//   - Article 3.3: validateSchemaName + parameterized queries
//   - Article 5.2: No PII in logs
//   - Article 6.1: Custom error codes for domain violations

import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { MAX_CUSTOM_ROLES, roleUsersCacheKey } from './constants.js';
import { permissionCacheService } from './permission-cache.service.js';
import type {
  Role,
  Permission,
  RoleWithPermissions,
  UserRole,
  RolePage,
  RoleFilters,
} from './types/index.js';
import type { CreateRoleDto } from './dto/create-role.dto.js';
import type { UpdateRoleDto } from './dto/update-role.dto.js';

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

export class SystemRoleImmutableError extends Error {
  readonly code = 'SYSTEM_ROLE_IMMUTABLE';
  constructor(roleName: string) {
    super(`System role "${roleName}" cannot be modified or deleted`);
    this.name = 'SystemRoleImmutableError';
  }
}

export class CustomRoleLimitError extends Error {
  readonly code = 'CUSTOM_ROLE_LIMIT_EXCEEDED';
  constructor() {
    super(`Cannot create more than ${MAX_CUSTOM_ROLES} custom roles per tenant`);
    this.name = 'CustomRoleLimitError';
  }
}

export class RoleNameConflictError extends Error {
  readonly code = 'ROLE_NAME_CONFLICT';
  constructor(name: string) {
    super(`A role with the name "${name}" already exists in this tenant`);
    this.name = 'RoleNameConflictError';
  }
}

export class RoleNotFoundError extends Error {
  readonly code = 'ROLE_NOT_FOUND';
  constructor(roleId: string) {
    super(`Role "${roleId}" not found`);
    this.name = 'RoleNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Schema name validation
// ---------------------------------------------------------------------------

function validateSchemaName(schemaName: string): void {
  const schemaPattern = /^tenant_[a-z0-9_]{1,63}$/;
  if (!schemaPattern.test(schemaName)) {
    throw new Error(
      `Invalid schema name: "${schemaName}". Must match pattern tenant_[a-z0-9_]{1,63}`
    );
  }
}

// ---------------------------------------------------------------------------
// Raw DB row types
// ---------------------------------------------------------------------------

interface RoleRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

interface PermissionRow {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  description: string | null;
  plugin_id: string | null;
  created_at: Date;
}

interface UserRoleRow {
  user_id: string;
  role_id: string;
  tenant_id: string;
  assigned_at: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRole(row: RoleRow): Role {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPermission(row: PermissionRow): Permission {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    key: row.key,
    name: row.name,
    description: row.description ?? undefined,
    pluginId: row.plugin_id,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// RoleService
// ---------------------------------------------------------------------------

export class RoleService {
  // -------------------------------------------------------------------------
  // Role CRUD
  // -------------------------------------------------------------------------

  /**
   * Creates a custom role in a tenant schema.
   *
   * Guards:
   *   - Custom role count < 50 (NFR-009) → CustomRoleLimitError (422)
   *   - Name uniqueness within tenant (FR-005) → RoleNameConflictError (409)
   *
   * Side effects:
   *   - Assigns listed permissionIds to the new role
   *   - Debounced cache invalidation for all users of this role
   */
  async createRole(
    tenantId: string,
    schemaName: string,
    dto: CreateRoleDto
  ): Promise<RoleWithPermissions> {
    validateSchemaName(schemaName);

    const role = await db.$transaction(async (tx) => {
      // Guard: custom role count limit — inside transaction to prevent TOCTOU race (FR-005, NFR-009)
      const countRows = await tx.$queryRawUnsafe<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count
         FROM "${schemaName}".roles
         WHERE tenant_id = $1 AND is_system = false`,
        tenantId
      );
      const customCount = parseInt(countRows[0]?.count ?? '0', 10);
      if (customCount >= MAX_CUSTOM_ROLES) {
        throw new CustomRoleLimitError();
      }

      // Guard: name uniqueness — inside transaction to prevent TOCTOU race
      const nameCheck = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${schemaName}".roles
         WHERE tenant_id = $1 AND name = $2
         LIMIT 1`,
        tenantId,
        dto.name
      );
      if (nameCheck.length > 0) {
        throw new RoleNameConflictError(dto.name);
      }

      // Insert role
      const inserted = await tx.$queryRawUnsafe<RoleRow[]>(
        `INSERT INTO "${schemaName}".roles
           (id, tenant_id, name, description, is_system, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, false, NOW(), NOW())
         RETURNING id, tenant_id, name, description, is_system, created_at, updated_at`,
        tenantId,
        dto.name,
        dto.description ?? null
      );

      const newRole = inserted[0];
      if (!newRole) throw new Error('Role insert failed unexpectedly');

      // Assign permissions
      if (dto.permissionIds.length > 0) {
        for (const permId of dto.permissionIds) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "${schemaName}".role_permissions (role_id, permission_id, tenant_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (role_id, permission_id) DO NOTHING`,
            newRole.id,
            permId,
            tenantId
          );
        }
      }

      return newRole;
    });

    // Debounced invalidation (no users assigned yet, but future-safe)
    permissionCacheService.debouncedInvalidateForRole(tenantId, role.id);

    logger.info({ tenantId, roleId: role.id, roleName: role.name }, 'Custom role created');

    const permissions = await this.getRolePermissions(tenantId, schemaName, role.id);
    return { ...mapRole(role), permissions };
  }

  /**
   * Returns a paginated list of roles for a tenant.
   */
  async listRoles(
    tenantId: string,
    schemaName: string,
    filters: RoleFilters = {}
  ): Promise<RolePage> {
    validateSchemaName(schemaName);

    const { search, isSystem, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clauses
    let whereClauses = `WHERE r.tenant_id = $1`;
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (typeof isSystem === 'boolean') {
      whereClauses += ` AND r.is_system = $${paramIndex++}`;
      params.push(isSystem);
    }

    if (search) {
      whereClauses += ` AND (r.name ILIKE $${paramIndex} OR r.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const countRows = await db.$queryRawUnsafe<Array<{ total: string }>>(
      `SELECT COUNT(*) AS total FROM "${schemaName}".roles r ${whereClauses}`,
      ...params
    );
    const total = parseInt(countRows[0]?.total ?? '0', 10);

    const roleRows = await db.$queryRawUnsafe<RoleRow[]>(
      `SELECT r.id, r.tenant_id, r.name, r.description, r.is_system, r.created_at, r.updated_at
       FROM "${schemaName}".roles r
       ${whereClauses}
       ORDER BY r.is_system DESC, r.name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      ...params,
      limit,
      offset
    );

    // Fetch permissions for each role
    const rolesWithPerms: RoleWithPermissions[] = await Promise.all(
      roleRows.map(async (row) => {
        const permissions = await this.getRolePermissions(tenantId, schemaName, row.id);
        return { ...mapRole(row), permissions };
      })
    );

    // Custom role count for meta
    const customCountRows = await db.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM "${schemaName}".roles
       WHERE tenant_id = $1 AND is_system = false`,
      tenantId
    );
    const customRoleCount = parseInt(customCountRows[0]?.count ?? '0', 10);

    return {
      data: rolesWithPerms,
      meta: { total, page, limit, customRoleCount },
    };
  }

  /**
   * Returns a single role with its permissions.
   * Throws RoleNotFoundError if not found.
   */
  async getRole(
    tenantId: string,
    schemaName: string,
    roleId: string
  ): Promise<RoleWithPermissions> {
    validateSchemaName(schemaName);

    const rows = await db.$queryRawUnsafe<RoleRow[]>(
      `SELECT id, tenant_id, name, description, is_system, created_at, updated_at
       FROM "${schemaName}".roles
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      roleId,
      tenantId
    );

    if (rows.length === 0) throw new RoleNotFoundError(roleId);

    const permissions = await this.getRolePermissions(tenantId, schemaName, roleId);
    return { ...mapRole(rows[0]), permissions };
  }

  /**
   * Updates a custom role's name, description, and/or permission set.
   * System roles cannot be updated (FR-004).
   */
  async updateRole(
    tenantId: string,
    schemaName: string,
    roleId: string,
    dto: UpdateRoleDto
  ): Promise<RoleWithPermissions> {
    validateSchemaName(schemaName);

    const existing = await this.getRole(tenantId, schemaName, roleId);

    if (existing.isSystem) throw new SystemRoleImmutableError(existing.name);

    // Guard: name uniqueness if name is being changed
    if (dto.name && dto.name !== existing.name) {
      const nameCheck = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${schemaName}".roles
         WHERE tenant_id = $1 AND name = $2 AND id != $3
         LIMIT 1`,
        tenantId,
        dto.name,
        roleId
      );
      if (nameCheck.length > 0) throw new RoleNameConflictError(dto.name);
    }

    await db.$transaction(async (tx) => {
      // Update role fields
      if (dto.name !== undefined || dto.description !== undefined) {
        const setClauses: string[] = ['updated_at = NOW()'];
        const params: unknown[] = [];
        let idx = 1;

        if (dto.name !== undefined) {
          setClauses.push(`name = $${idx++}`);
          params.push(dto.name);
        }
        if (dto.description !== undefined) {
          setClauses.push(`description = $${idx++}`);
          params.push(dto.description);
        }
        params.push(roleId, tenantId);

        await tx.$executeRawUnsafe(
          `UPDATE "${schemaName}".roles
           SET ${setClauses.join(', ')}
           WHERE id = $${idx++} AND tenant_id = $${idx}`,
          ...params
        );
      }

      // Replace permission set if provided
      if (dto.permissionIds !== undefined) {
        // Remove all current permissions then re-add
        await tx.$executeRawUnsafe(
          `DELETE FROM "${schemaName}".role_permissions
           WHERE role_id = $1 AND tenant_id = $2`,
          roleId,
          tenantId
        );

        for (const permId of dto.permissionIds) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "${schemaName}".role_permissions (role_id, permission_id, tenant_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (role_id, permission_id) DO NOTHING`,
            roleId,
            permId,
            tenantId
          );
        }
      }
    });

    permissionCacheService.debouncedInvalidateForRole(tenantId, roleId);

    logger.info({ tenantId, roleId }, 'Role updated');

    return this.getRole(tenantId, schemaName, roleId);
  }

  /**
   * Deletes a custom role.
   * System roles cannot be deleted (FR-004).
   * User role assignments cascade automatically via FK.
   */
  async deleteRole(tenantId: string, schemaName: string, roleId: string): Promise<void> {
    validateSchemaName(schemaName);

    const existing = await this.getRole(tenantId, schemaName, roleId);
    if (existing.isSystem) throw new SystemRoleImmutableError(existing.name);

    // Invalidate before deletion so we can still look up the role→users index
    await permissionCacheService.invalidateForRole(tenantId, roleId);

    await db.$executeRawUnsafe(
      `DELETE FROM "${schemaName}".roles WHERE id = $1 AND tenant_id = $2`,
      roleId,
      tenantId
    );

    logger.info({ tenantId, roleId }, 'Custom role deleted');
  }

  // -------------------------------------------------------------------------
  // User role assignment
  // -------------------------------------------------------------------------

  /**
   * Assigns a role to a user within a tenant.
   *
   * Side effects:
   *   - Upserts user_roles row
   *   - Adds userId to Redis role→users index (SADD)
   *   - Invalidates the user's permission cache immediately
   */
  async assignRoleToUser(
    tenantId: string,
    schemaName: string,
    userId: string,
    roleId: string
  ): Promise<void> {
    validateSchemaName(schemaName);

    // Verify role exists in this tenant
    const roleRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "${schemaName}".roles WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      roleId,
      tenantId
    );
    if (roleRows.length === 0) throw new RoleNotFoundError(roleId);

    await db.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".user_roles (user_id, role_id, tenant_id, assigned_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      userId,
      roleId,
      tenantId
    );

    // Update reverse index in Redis
    try {
      await require('../../lib/redis.js').default.sadd(roleUsersCacheKey(tenantId, roleId), userId);
    } catch {
      // Non-critical — next getUserPermissions call will repopulate
    }

    // Flush this user's permission cache immediately
    await permissionCacheService.invalidateForUser(tenantId, userId);

    logger.info({ tenantId, userId, roleId }, 'Role assigned to user');
  }

  /**
   * Removes a role from a user within a tenant.
   *
   * Side effects:
   *   - Deletes user_roles row
   *   - Removes userId from Redis role→users index (SREM)
   *   - Invalidates the user's permission cache immediately
   */
  async removeRoleFromUser(
    tenantId: string,
    schemaName: string,
    userId: string,
    roleId: string
  ): Promise<void> {
    validateSchemaName(schemaName);

    await db.$executeRawUnsafe(
      `DELETE FROM "${schemaName}".user_roles
       WHERE user_id = $1 AND role_id = $2 AND tenant_id = $3`,
      userId,
      roleId,
      tenantId
    );

    // Remove from reverse index
    try {
      await require('../../lib/redis.js').default.srem(roleUsersCacheKey(tenantId, roleId), userId);
    } catch {
      // Non-critical
    }

    await permissionCacheService.invalidateForUser(tenantId, userId);

    logger.info({ tenantId, userId, roleId }, 'Role removed from user');
  }

  /**
   * Returns the roles assigned to a user.
   */
  async getUserRoles(tenantId: string, schemaName: string, userId: string): Promise<Role[]> {
    validateSchemaName(schemaName);

    const rows = await db.$queryRawUnsafe<RoleRow[]>(
      `SELECT r.id, r.tenant_id, r.name, r.description, r.is_system, r.created_at, r.updated_at
       FROM "${schemaName}".user_roles ur
       JOIN "${schemaName}".roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND ur.tenant_id = $2
       ORDER BY r.name ASC`,
      userId,
      tenantId
    );

    return rows.map(mapRole);
  }

  /**
   * Returns the effective permission keys for a user by JOINing user_roles →
   * role_permissions → permissions.
   *
   * This is the authoritative DB-level lookup used when the cache misses.
   * Returns unique permission keys only (union of all role permissions, FR-006).
   *
   * Also returns the roleIds for use when writing back to cache.
   */
  async getUserPermissions(
    tenantId: string,
    schemaName: string,
    userId: string
  ): Promise<{ permissionKeys: string[]; roleIds: string[] }> {
    validateSchemaName(schemaName);

    const rows = await db.$queryRawUnsafe<Array<{ permission_key: string; role_id: string }>>(
      `SELECT DISTINCT p.key AS permission_key, ur.role_id
       FROM "${schemaName}".user_roles ur
       JOIN "${schemaName}".role_permissions rp ON ur.role_id = rp.role_id AND ur.tenant_id = rp.tenant_id
       JOIN "${schemaName}".permissions p ON rp.permission_id = p.id AND rp.tenant_id = p.tenant_id
       WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
      userId,
      tenantId
    );

    const permissionKeys = [...new Set(rows.map((r) => r.permission_key))];
    const roleIds = [...new Set(rows.map((r) => r.role_id))];

    return { permissionKeys, roleIds };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Returns permissions for a single role. */
  async getRolePermissions(
    tenantId: string,
    schemaName: string,
    roleId: string
  ): Promise<Permission[]> {
    const rows = await db.$queryRawUnsafe<PermissionRow[]>(
      `SELECT p.id, p.tenant_id, p.key, p.name, p.description, p.plugin_id, p.created_at
       FROM "${schemaName}".role_permissions rp
       JOIN "${schemaName}".permissions p ON rp.permission_id = p.id
       WHERE rp.role_id = $1 AND rp.tenant_id = $2
       ORDER BY p.key ASC`,
      roleId,
      tenantId
    );

    return rows.map(mapPermission);
  }

  /**
   * Returns all user_role rows for a user (for display in user detail views).
   */
  async getUserRoleRecords(
    tenantId: string,
    schemaName: string,
    userId: string
  ): Promise<UserRole[]> {
    validateSchemaName(schemaName);

    const rows = await db.$queryRawUnsafe<UserRoleRow[]>(
      `SELECT user_id, role_id, tenant_id, assigned_at
       FROM "${schemaName}".user_roles
       WHERE user_id = $1 AND tenant_id = $2`,
      userId,
      tenantId
    );

    return rows.map((r) => ({
      userId: r.user_id,
      roleId: r.role_id,
      tenantId: r.tenant_id,
      assignedAt: r.assigned_at,
    }));
  }
}

/** Singleton instance */
export const roleService = new RoleService();
