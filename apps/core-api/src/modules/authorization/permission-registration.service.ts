// apps/core-api/src/modules/authorization/permission-registration.service.ts
//
// Manages plugin permission registration and core permission seeding.
// Spec 003 FR-011, FR-012, FR-013, Edge Case #4, Task 2.3
//
// Constitution Compliance:
//   - Article 1.2: Tenant isolation (all queries scoped to tenantId)
//   - Article 3.3: Parameterized queries — schema name validated with strict regex
//     before interpolation; all user data passed as $N parameters
//   - Article 5.3: Input validation via validateSchemaName

import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { CORE_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from './constants.js';
import { permissionCacheService } from './permission-cache.service.js';
import type { Permission } from './types/index.js';

/** Minimal permission input shape for plugin registration */
export interface PluginPermissionInput {
  key: string;
  name: string;
  description?: string;
}

/**
 * Validates a schema name to prevent SQL injection.
 * Must be called before any schema name interpolation into raw SQL.
 * Mirrors the pattern in PermissionService and SchemaStep.
 */
function validateSchemaName(schemaName: string): void {
  const schemaPattern = /^tenant_[a-z0-9_]{1,63}$/;
  if (!schemaPattern.test(schemaName)) {
    throw new Error(
      `Invalid schema name: "${schemaName}". Must match pattern tenant_[a-z0-9_]{1,63}`
    );
  }
}

/**
 * Service responsible for registering and removing permissions contributed
 * by plugins, and for idempotently seeding core permissions for a tenant.
 *
 * Called by:
 *   - Plugin install lifecycle hook → registerPluginPermissions()
 *   - Plugin uninstall lifecycle hook → removePluginPermissions()
 *   - SchemaStep → registerCorePermissions()
 */
export class PermissionRegistrationService {
  /**
   * Registers permissions contributed by a plugin for a given tenant.
   *
   * - Checks for key conflicts with existing non-plugin permissions (Edge Case #4)
   * - Upserts permission rows (idempotent on key conflict within same plugin)
   * - Invalidates the full tenant permission cache
   *
   * @throws Error with code PERMISSION_KEY_CONFLICT if a key clashes with
   *   a core or different-plugin permission (409-worthy)
   */
  async registerPluginPermissions(
    tenantId: string,
    schemaName: string,
    pluginId: string,
    permissions: PluginPermissionInput[]
  ): Promise<void> {
    validateSchemaName(schemaName);

    if (permissions.length === 0) return;

    await db.$transaction(async (tx) => {
      for (const perm of permissions) {
        // Check for conflict: same key owned by a different plugin or by core
        const existing = await tx.$queryRawUnsafe<Array<{ plugin_id: string | null }>>(
          `SELECT plugin_id
           FROM "${schemaName}".permissions
           WHERE tenant_id = $1 AND key = $2
           LIMIT 1`,
          tenantId,
          perm.key
        );

        if (existing.length > 0) {
          const existingPluginId = existing[0].plugin_id;
          if (existingPluginId !== pluginId) {
            // Key is owned by core (null) or another plugin — hard conflict
            const owner = existingPluginId ?? 'core';
            throw Object.assign(
              new Error(
                `Permission key "${perm.key}" is already registered by ${owner}. ` +
                  'Plugin installation aborted.'
              ),
              { code: 'PERMISSION_KEY_CONFLICT', key: perm.key, existingOwner: owner }
            );
          }
          // Same plugin re-registering — update name/description (idempotent upsert)
          await tx.$executeRawUnsafe(
            `UPDATE "${schemaName}".permissions
             SET name = $1, description = $2
             WHERE tenant_id = $3 AND key = $4 AND plugin_id = $5`,
            perm.name,
            perm.description ?? null,
            tenantId,
            perm.key,
            pluginId
          );
          continue;
        }

        // Insert new plugin permission
        await tx.$executeRawUnsafe(
          `INSERT INTO "${schemaName}".permissions
             (id, tenant_id, key, name, description, plugin_id, created_at)
           VALUES
             (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
          tenantId,
          perm.key,
          perm.name,
          perm.description ?? null,
          pluginId
        );
      }
    });

    logger.info({ tenantId, pluginId, count: permissions.length }, 'Plugin permissions registered');

    // Invalidate all user permission caches in this tenant
    await permissionCacheService.invalidateForTenant(tenantId);
  }

  /**
   * Removes all permissions contributed by a plugin from a tenant.
   *
   * - Deletes role_permissions entries referencing these permissions (FR-013)
   * - Deletes the permissions themselves
   * - Invalidates the full tenant permission cache
   */
  async removePluginPermissions(
    tenantId: string,
    schemaName: string,
    pluginId: string
  ): Promise<void> {
    validateSchemaName(schemaName);

    await db.$transaction(async (tx) => {
      // Cascade: remove role_permissions rows that reference these plugin permissions
      await tx.$executeRawUnsafe(
        `DELETE FROM "${schemaName}".role_permissions
         WHERE permission_id IN (
           SELECT id FROM "${schemaName}".permissions
           WHERE tenant_id = $1 AND plugin_id = $2
         )`,
        tenantId,
        pluginId
      );

      // Delete the permissions themselves
      await tx.$executeRawUnsafe(
        `DELETE FROM "${schemaName}".permissions
         WHERE tenant_id = $1 AND plugin_id = $2`,
        tenantId,
        pluginId
      );
    });

    logger.info({ tenantId, pluginId }, 'Plugin permissions removed');

    await permissionCacheService.invalidateForTenant(tenantId);
  }

  /**
   * Idempotently seeds core permissions and system role-permission mappings
   * for a tenant. Safe to call multiple times (ON CONFLICT DO NOTHING).
   *
   * Called by SchemaStep after table creation to populate the initial
   * permission/role data.
   */
  async registerCorePermissions(tenantId: string, schemaName: string): Promise<void> {
    validateSchemaName(schemaName);

    // Human-readable names for core permissions
    const PERMISSION_META: Record<string, { name: string; description: string }> = {
      [CORE_PERMISSIONS.USERS_READ]: {
        name: 'Read Users',
        description: 'View user profiles and list users',
      },
      [CORE_PERMISSIONS.USERS_WRITE]: {
        name: 'Write Users',
        description: 'Create, update, and delete users',
      },
      [CORE_PERMISSIONS.ROLES_READ]: {
        name: 'Read Roles',
        description: 'View roles and permissions',
      },
      [CORE_PERMISSIONS.ROLES_WRITE]: {
        name: 'Write Roles',
        description: 'Create, update, and delete custom roles',
      },
      [CORE_PERMISSIONS.POLICIES_READ]: {
        name: 'Read Policies',
        description: 'View ABAC policies',
      },
      [CORE_PERMISSIONS.POLICIES_WRITE]: {
        name: 'Write Policies',
        description: 'Create, update, and delete ABAC policies',
      },
      [CORE_PERMISSIONS.WORKSPACES_READ]: {
        name: 'Read Workspaces',
        description: 'View workspaces and workspace members',
      },
      [CORE_PERMISSIONS.WORKSPACES_WRITE]: {
        name: 'Write Workspaces',
        description: 'Create, update, and delete workspaces',
      },
      [CORE_PERMISSIONS.SETTINGS_READ]: {
        name: 'Read Settings',
        description: 'View tenant settings',
      },
      [CORE_PERMISSIONS.SETTINGS_WRITE]: {
        name: 'Write Settings',
        description: 'Update tenant settings',
      },
      [CORE_PERMISSIONS.PLUGINS_READ]: {
        name: 'Read Plugins',
        description: 'View installed plugins',
      },
      [CORE_PERMISSIONS.PLUGINS_WRITE]: {
        name: 'Write Plugins',
        description: 'Install and uninstall plugins',
      },
    };

    await db.$transaction(async (tx) => {
      // 1. Upsert all core permissions; collect their IDs
      const permissionIdMap = new Map<string, string>();

      for (const [key, meta] of Object.entries(PERMISSION_META)) {
        const upserted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO "${schemaName}".permissions
             (id, tenant_id, key, name, description, plugin_id, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, NULL, NOW())
           ON CONFLICT (tenant_id, key) DO UPDATE
             SET name = EXCLUDED.name, description = EXCLUDED.description
           RETURNING id`,
          tenantId,
          key,
          meta.name,
          meta.description
        );

        if (upserted.length > 0) {
          permissionIdMap.set(key, upserted[0].id);
        }
      }

      // 2. Seed system role → permission mappings
      for (const [roleName, permKeys] of Object.entries(SYSTEM_ROLE_PERMISSIONS) as [
        string,
        readonly string[],
      ][]) {
        // Get role ID
        const roleRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM "${schemaName}".roles
           WHERE tenant_id = $1 AND name = $2
           LIMIT 1`,
          tenantId,
          roleName
        );

        if (roleRows.length === 0) {
          logger.warn(
            { tenantId, roleName, schemaName },
            'System role not found during core permission seeding — skipping'
          );
          continue;
        }

        const roleId = roleRows[0].id;

        for (const permKey of permKeys) {
          const permId = permissionIdMap.get(permKey);
          if (!permId) continue;

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

    logger.info({ tenantId, schemaName }, 'Core permissions seeded');
  }

  /**
   * Returns all permissions registered for a tenant (core + plugin), sorted by key.
   */
  async listPermissions(tenantId: string, schemaName: string): Promise<Permission[]> {
    validateSchemaName(schemaName);

    const rows = await db.$queryRawUnsafe<
      Array<{
        id: string;
        tenant_id: string;
        key: string;
        name: string;
        description: string | null;
        plugin_id: string | null;
        created_at: Date;
      }>
    >(
      `SELECT id, tenant_id, key, name, description, plugin_id, created_at
       FROM "${schemaName}".permissions
       WHERE tenant_id = $1
       ORDER BY key ASC`,
      tenantId
    );

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      key: r.key,
      name: r.name,
      description: r.description ?? undefined,
      pluginId: r.plugin_id,
      createdAt: r.created_at,
    }));
  }
}

/** Singleton instance */
export const permissionRegistrationService = new PermissionRegistrationService();
