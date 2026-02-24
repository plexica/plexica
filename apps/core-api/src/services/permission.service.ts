import { randomUUID } from 'crypto';
import { db } from '../lib/db.js';
import { authorizationService } from '../modules/authorization/authorization.service.js';

/**
 * Permission format: resource.action
 * Examples: users.read, users.write, posts.delete, settings.manage
 */
export type Permission = string;

/**
 * Role with permissions
 */
export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
}

/**
 * User with roles
 */
export interface UserWithRoles {
  id: string;
  keycloakId: string;
  email: string;
  roles: Role[];
}

/**
 * @deprecated Use `AuthorizationService` from `modules/authorization/authorization.service.ts`
 * instead. This class is retained for backward compatibility during the Spec 003 migration and
 * will be removed in a future release.
 *
 * Permission Service
 * Manages roles and permissions within a tenant's schema
 */
export class PermissionService {
  /**
   * Validate schema name to prevent SQL injection
   */
  private validateSchemaName(schemaName: string): void {
    const schemaPattern = /^tenant_[a-z0-9_]{1,63}$/;
    if (!schemaPattern.test(schemaName)) {
      throw new Error(
        `Invalid schema name: ${schemaName}. Must match pattern tenant_[a-z0-9_]{{1,63}}`
      );
    }
  }

  /**
   * Get all permissions for a user in a tenant.
   *
   * @deprecated Delegates to `AuthorizationService.getUserEffectivePermissions()`.
   * Call that method directly for new code. The `schemaName` parameter is preserved
   * for backward compatibility; `tenantId` is derived from the schema name.
   */
  async getUserPermissions(userId: string, schemaName: string): Promise<Permission[]> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    // Derive tenantId by looking up the tenant record whose schema matches.
    // For the legacy callers that only have schemaName, we convert back to the slug
    // (schema = "tenant_<slug_with_underscores>") and query the DB.
    // Fall back to the direct DB query if the tenant cannot be found.
    try {
      // schema pattern: tenant_<slug_underscored>  → slug = replace underscores with hyphens
      const slug = schemaName.replace(/^tenant_/, '').replace(/_/g, '-');
      const tenant = await db.tenant.findUnique({ where: { slug }, select: { id: true } });
      if (tenant) {
        const result = await authorizationService.getUserEffectivePermissions(
          userId,
          tenant.id,
          schemaName
        );
        return result.data;
      }
    } catch {
      // Fall through to legacy implementation below
    }

    // Legacy fallback: direct DB query (kept for safety during migration)
    return db.$transaction(async (tx) => {
      // SET LOCAL is scoped to the transaction — automatically reverts on commit/rollback
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);

      // Get user roles and their permissions
      const result = await tx.$queryRawUnsafe<Array<{ permissions: Permission[] }>>(
        `
        SELECT DISTINCT r.permissions
        FROM "${schemaName}".user_roles ur
        JOIN "${schemaName}".roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1
        `,
        userId
      );

      // Aggregate all permissions from all roles
      const permissions = new Set<Permission>();

      for (const row of result) {
        const rolePermissions = row.permissions;
        if (Array.isArray(rolePermissions)) {
          rolePermissions.forEach((p) => permissions.add(p));
        }
      }

      return Array.from(permissions);
    });
  }

  /**
   * Check if a user has a specific permission
   */
  async hasPermission(
    userId: string,
    schemaName: string,
    permission: Permission
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, schemaName);
    return permissions.includes(permission);
  }

  /**
   * Check if a user has any of the specified permissions
   */
  async hasAnyPermission(
    userId: string,
    schemaName: string,
    permissions: Permission[]
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, schemaName);
    return permissions.some((p) => userPermissions.includes(p));
  }

  /**
   * Check if a user has all of the specified permissions
   */
  async hasAllPermissions(
    userId: string,
    schemaName: string,
    permissions: Permission[]
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, schemaName);
    return permissions.every((p) => userPermissions.includes(p));
  }

  /**
   * Create a new role in a tenant
   */
  async createRole(
    schemaName: string,
    name: string,
    permissions: Permission[],
    description?: string
  ): Promise<Role> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);

      const id = randomUUID();

      await tx.$executeRawUnsafe(
        `
         INSERT INTO "${schemaName}".roles (id, name, description, permissions, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
         `,
        id,
        name,
        description || null,
        JSON.stringify(permissions)
      );

      return {
        id,
        name,
        description,
        permissions,
      };
    });
  }

  /**
   * Update role permissions
   */
  async updateRolePermissions(
    schemaName: string,
    roleId: string,
    permissions: Permission[]
  ): Promise<void> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);

      await tx.$executeRawUnsafe(
        `
         UPDATE "${schemaName}".roles
         SET permissions = $1::jsonb, updated_at = NOW()
         WHERE id = $2
         `,
        JSON.stringify(permissions),
        roleId
      );
    });
  }

  /**
   * Get all roles in a tenant
   */
  async getRoles(schemaName: string): Promise<Role[]> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);

      const roles = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          description: string | null;
          permissions: Permission[];
        }>
      >(
        `
        SELECT id, name, description, permissions
        FROM "${schemaName}".roles
        ORDER BY name
        `
      );

      return roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description || undefined,
        permissions: role.permissions,
      }));
    });
  }

  /**
   * Get a specific role
   */
  async getRole(schemaName: string, roleId: string): Promise<Role | null> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);

      const roles = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          description: string | null;
          permissions: Permission[];
        }>
      >(
        `
        SELECT id, name, description, permissions
        FROM "${schemaName}".roles
        WHERE id = $1
        `,
        roleId
      );

      if (roles.length === 0) {
        return null;
      }

      const role = roles[0];
      return {
        id: role.id,
        name: role.name,
        description: role.description || undefined,
        permissions: role.permissions,
      };
    });
  }

  /**
   * Delete a role
   */
  async deleteRole(schemaName: string, roleId: string): Promise<void> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);

      await tx.$executeRawUnsafe(
        `
        DELETE FROM "${schemaName}".roles
        WHERE id = $1
        `,
        roleId
      );
    });
  }

  /**
   * Assign role to user
   */
  async assignRoleToUser(schemaName: string, userId: string, roleId: string): Promise<void> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);

      await tx.$executeRawUnsafe(
        `
        INSERT INTO "${schemaName}".user_roles (user_id, role_id, assigned_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id, role_id) DO NOTHING
        `,
        userId,
        roleId
      );
    });
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(schemaName: string, userId: string, roleId: string): Promise<void> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);

      await tx.$executeRawUnsafe(
        `
        DELETE FROM "${schemaName}".user_roles
        WHERE user_id = $1 AND role_id = $2
        `,
        userId,
        roleId
      );
    });
  }

  /**
   * Get user roles
   */
  async getUserRoles(schemaName: string, userId: string): Promise<Role[]> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);

      const roles = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          description: string | null;
          permissions: Permission[];
        }>
      >(
        `
        SELECT r.id, r.name, r.description, r.permissions
        FROM "${schemaName}".user_roles ur
        JOIN "${schemaName}".roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1
        ORDER BY r.name
        `,
        userId
      );

      return roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description || undefined,
        permissions: role.permissions,
      }));
    });
  }

  /**
   * Initialize default roles for a new tenant
   */
  async initializeDefaultRoles(schemaName: string): Promise<void> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    // Admin role with all permissions
    await this.createRole(
      schemaName,
      'admin',
      [
        'users.read',
        'users.write',
        'users.delete',
        'roles.read',
        'roles.write',
        'roles.delete',
        'settings.read',
        'settings.write',
        'plugins.read',
        'plugins.write',
      ],
      'Administrator with full access'
    );

    // User role with basic permissions
    await this.createRole(
      schemaName,
      'user',
      ['users.read', 'settings.read'],
      'Standard user with read access'
    );

    // Guest role with minimal permissions
    await this.createRole(schemaName, 'guest', ['users.read'], 'Guest with minimal read access');
  }
}

// Singleton instance
export const permissionService = new PermissionService();

// Common permission sets
export const Permissions = {
  USERS_READ: 'users.read',
  USERS_WRITE: 'users.write',
  USERS_DELETE: 'users.delete',
  ROLES_READ: 'roles.read',
  ROLES_WRITE: 'roles.write',
  ROLES_DELETE: 'roles.delete',
  SETTINGS_READ: 'settings.read',
  SETTINGS_WRITE: 'settings.write',
  PLUGINS_READ: 'plugins.read',
  PLUGINS_WRITE: 'plugins.write',
} as const;
