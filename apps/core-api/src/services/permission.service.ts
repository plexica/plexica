import { db } from '../lib/db.js';

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
   * Get all permissions for a user in a tenant
   */
  async getUserPermissions(userId: string, schemaName: string): Promise<Permission[]> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    // Set schema
    await db.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

    try {
      // Get user roles and their permissions
      const result = await db.$queryRawUnsafe<Array<{ permissions: any }>>(
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
        const rolePermissions = row.permissions as Permission[];
        if (Array.isArray(rolePermissions)) {
          rolePermissions.forEach((p) => permissions.add(p));
        }
      }

      return Array.from(permissions);
    } finally {
      // Reset schema
      await db.$executeRawUnsafe(`SET search_path TO public, core`);
    }
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

    await db.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

    try {
      const id = crypto.randomUUID();

      await db.$executeRawUnsafe(
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
    } finally {
      await db.$executeRawUnsafe(`SET search_path TO public, core`);
    }
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

    await db.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

    try {
      await db.$executeRawUnsafe(
        `
         UPDATE "${schemaName}".roles
         SET permissions = $1::jsonb, updated_at = NOW()
         WHERE id = $2
         `,
        JSON.stringify(permissions),
        roleId
      );
    } finally {
      await db.$executeRawUnsafe(`SET search_path TO public, core`);
    }
  }

  /**
   * Get all roles in a tenant
   */
  async getRoles(schemaName: string): Promise<Role[]> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    await db.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

    try {
      const roles = await db.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          description: string | null;
          permissions: any;
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
        permissions: role.permissions as Permission[],
      }));
    } finally {
      await db.$executeRawUnsafe(`SET search_path TO public, core`);
    }
  }

  /**
   * Get a specific role
   */
  async getRole(schemaName: string, roleId: string): Promise<Role | null> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    await db.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

    try {
      const roles = await db.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          description: string | null;
          permissions: any;
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
        permissions: role.permissions as Permission[],
      };
    } finally {
      await db.$executeRawUnsafe(`SET search_path TO public, core`);
    }
  }

  /**
   * Delete a role
   */
  async deleteRole(schemaName: string, roleId: string): Promise<void> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    await db.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

    try {
      await db.$executeRawUnsafe(
        `
        DELETE FROM "${schemaName}".roles
        WHERE id = $1
        `,
        roleId
      );
    } finally {
      await db.$executeRawUnsafe(`SET search_path TO public, core`);
    }
  }

  /**
   * Assign role to user
   */
  async assignRoleToUser(schemaName: string, userId: string, roleId: string): Promise<void> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    await db.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

    try {
      await db.$executeRawUnsafe(
        `
        INSERT INTO "${schemaName}".user_roles (user_id, role_id, assigned_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id, role_id) DO NOTHING
        `,
        userId,
        roleId
      );
    } finally {
      await db.$executeRawUnsafe(`SET search_path TO public, core`);
    }
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(schemaName: string, userId: string, roleId: string): Promise<void> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    await db.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

    try {
      await db.$executeRawUnsafe(
        `
        DELETE FROM "${schemaName}".user_roles
        WHERE user_id = $1 AND role_id = $2
        `,
        userId,
        roleId
      );
    } finally {
      await db.$executeRawUnsafe(`SET search_path TO public, core`);
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(schemaName: string, userId: string): Promise<Role[]> {
    // Validate schema name to prevent SQL injection
    this.validateSchemaName(schemaName);

    await db.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

    try {
      const roles = await db.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          description: string | null;
          permissions: any;
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
        permissions: role.permissions as Permission[],
      }));
    } finally {
      await db.$executeRawUnsafe(`SET search_path TO public, core`);
    }
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
