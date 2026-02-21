// apps/core-api/src/modules/workspace/workspace-plugin.service.ts
//
// Per-workspace plugin enablement, configuration, and cascade management.
// Implements Spec 011 Phase 2 — FR-023, FR-024, FR-025, FR-026.
//
// All queries use Prisma.$queryRaw / Prisma.sql (no string interpolation).
// Error responses follow Constitution Art. 6.2 format via WorkspaceError.

import { PrismaClient, Prisma } from '@plexica/database';
import { db } from '../../lib/db.js';
import { logger as rootLogger } from '../../lib/logger.js';
import type { TenantContext } from '../../middleware/tenant-context.js';
import type { Logger } from 'pino';
import { WorkspaceError, WorkspaceErrorCode } from './utils/error-formatter.js';
import type { WorkspacePluginRow } from './types/workspace-plugin.types.js';

/**
 * Manages per-workspace plugin enablement and configuration.
 *
 * WorkspacePlugin records are children of both Workspace and Plugin.
 * Tenant-level enablement is a prerequisite — a plugin must be
 * enabled in `tenant_plugins` before it can be enabled in a workspace.
 * Cascade disable is triggered when a tenant-level plugin is disabled.
 */
export class WorkspacePluginService {
  private readonly db: PrismaClient;
  private readonly logger: Logger;

  constructor(customDb?: PrismaClient, customLogger?: Logger) {
    this.db = customDb ?? db;
    this.logger = customLogger ?? rootLogger;
  }

  // ---------------------------------------------------------------------------
  // Plugin enablement
  // ---------------------------------------------------------------------------

  /**
   * Enable a plugin for a workspace.
   *
   * Validates that the plugin is enabled at the tenant level first.
   * Throws WORKSPACE_PLUGIN_EXISTS if already enabled.
   */
  async enablePlugin(
    workspaceId: string,
    pluginId: string,
    config: Record<string, unknown>,
    tenantCtx: TenantContext
  ): Promise<WorkspacePluginRow> {
    this.logger.debug(
      { workspaceId, pluginId, tenantId: tenantCtx.tenantId },
      'workspace-plugin: enabling plugin'
    );

    await this.validateTenantPluginEnabled(pluginId, tenantCtx.tenantId);

    const configJson = JSON.stringify(config);

    // Atomic INSERT — if the (workspace_id, plugin_id) unique constraint fires,
    // ON CONFLICT DO NOTHING returns 0 rows, which means the plugin is already
    // enabled. This removes the TOCTOU race between the previous SELECT + INSERT.
    const rows = await this.db.$queryRaw<WorkspacePluginRow[]>(
      Prisma.sql`INSERT INTO workspace_plugins
                   (workspace_id, plugin_id, enabled, configuration, created_at, updated_at)
                 VALUES
                   (${workspaceId}::uuid, ${pluginId}, true, ${configJson}::jsonb, NOW(), NOW())
                 ON CONFLICT (workspace_id, plugin_id) DO NOTHING
                 RETURNING workspace_id, plugin_id, enabled, configuration, created_at, updated_at`
    );

    if (rows.length === 0) {
      throw new WorkspaceError(
        WorkspaceErrorCode.WORKSPACE_PLUGIN_EXISTS,
        `Plugin ${pluginId} is already enabled for workspace ${workspaceId}`,
        { workspaceId, pluginId }
      );
    }

    this.logger.info(
      { workspaceId, pluginId, tenantId: tenantCtx.tenantId },
      'workspace-plugin: plugin enabled'
    );
    return rows[0];
  }

  /**
   * Disable a plugin for a workspace (sets enabled = false, preserves config).
   *
   * Throws WORKSPACE_PLUGIN_NOT_FOUND if no record exists.
   *
   * Security: the UPDATE is scoped to the caller's tenant via a JOIN on workspaces,
   * preventing cross-tenant mutation even if workspaceId belongs to another tenant.
   */
  async disablePlugin(
    workspaceId: string,
    pluginId: string,
    tenantCtx: TenantContext
  ): Promise<void> {
    this.logger.debug(
      { workspaceId, pluginId, tenantId: tenantCtx.tenantId },
      'workspace-plugin: disabling plugin'
    );

    const result = await this.db.$executeRaw(
      Prisma.sql`UPDATE workspace_plugins wp
                 SET enabled = false, updated_at = NOW()
                 FROM workspaces w
                 WHERE wp.workspace_id = w.id
                   AND wp.workspace_id = ${workspaceId}::uuid
                   AND wp.plugin_id = ${pluginId}
                   AND w.tenant_id = ${tenantCtx.tenantId}::uuid`
    );

    if (result === 0) {
      throw new WorkspaceError(
        WorkspaceErrorCode.WORKSPACE_PLUGIN_NOT_FOUND,
        `Plugin ${pluginId} is not configured for workspace ${workspaceId}`,
        { workspaceId, pluginId }
      );
    }

    this.logger.info(
      { workspaceId, pluginId, tenantId: tenantCtx.tenantId },
      'workspace-plugin: plugin disabled'
    );
  }

  /**
   * Update the configuration JSON for a workspace plugin.
   *
   * Throws WORKSPACE_PLUGIN_NOT_FOUND if no record exists.
   *
   * Security: the UPDATE is scoped to the caller's tenant via a JOIN on workspaces,
   * preventing cross-tenant mutation even if workspaceId belongs to another tenant.
   */
  async updateConfig(
    workspaceId: string,
    pluginId: string,
    config: Record<string, unknown>,
    tenantCtx: TenantContext
  ): Promise<WorkspacePluginRow> {
    this.logger.debug(
      { workspaceId, pluginId, tenantId: tenantCtx.tenantId },
      'workspace-plugin: updating config'
    );

    const configJson = JSON.stringify(config);
    const rows = await this.db.$queryRaw<WorkspacePluginRow[]>(
      Prisma.sql`UPDATE workspace_plugins wp
                 SET configuration = ${configJson}::jsonb, updated_at = NOW()
                 FROM workspaces w
                 WHERE wp.workspace_id = w.id
                   AND wp.workspace_id = ${workspaceId}::uuid
                   AND wp.plugin_id = ${pluginId}
                   AND w.tenant_id = ${tenantCtx.tenantId}::uuid
                 RETURNING wp.workspace_id, wp.plugin_id, wp.enabled,
                           wp.configuration, wp.created_at, wp.updated_at`
    );

    if (rows.length === 0) {
      throw new WorkspaceError(
        WorkspaceErrorCode.WORKSPACE_PLUGIN_NOT_FOUND,
        `Plugin ${pluginId} is not configured for workspace ${workspaceId}`,
        { workspaceId, pluginId }
      );
    }

    return rows[0];
  }

  /**
   * List all plugin records for a workspace (both enabled and disabled).
   *
   * Security: the SELECT is scoped to the caller's tenant via a JOIN on workspaces,
   * preventing cross-tenant information disclosure even if workspaceId belongs to
   * another tenant (Constitution Art. 1.2§2, Art. 5.1§5).
   */
  async listPlugins(workspaceId: string, tenantCtx: TenantContext): Promise<WorkspacePluginRow[]> {
    this.logger.debug(
      { workspaceId, tenantId: tenantCtx.tenantId },
      'workspace-plugin: listing plugins'
    );

    return this.db.$queryRaw<WorkspacePluginRow[]>(
      Prisma.sql`SELECT wp.workspace_id, wp.plugin_id, wp.enabled,
                        wp.configuration, wp.created_at, wp.updated_at
                 FROM workspace_plugins wp
                 JOIN workspaces w ON w.id = wp.workspace_id
                 WHERE wp.workspace_id = ${workspaceId}::uuid
                   AND w.tenant_id = ${tenantCtx.tenantId}::uuid
                 ORDER BY wp.created_at ASC`
    );
  }

  // ---------------------------------------------------------------------------
  // Tenant-level validation
  // ---------------------------------------------------------------------------

  /**
   * Verify that a plugin is enabled at the tenant level.
   *
   * Throws PLUGIN_NOT_TENANT_ENABLED if the plugin is not found in
   * `tenant_plugins` or its `enabled` flag is false.
   */
  async validateTenantPluginEnabled(pluginId: string, tenantId: string): Promise<void> {
    const rows = await this.db.$queryRaw<Array<{ enabled: boolean }>>(
      Prisma.sql`SELECT enabled
                 FROM tenant_plugins
                 WHERE tenant_id = ${tenantId}::uuid
                   AND plugin_id = ${pluginId}
                 LIMIT 1`
    );

    if (rows.length === 0 || !rows[0].enabled) {
      throw new WorkspaceError(
        WorkspaceErrorCode.PLUGIN_NOT_TENANT_ENABLED,
        `Plugin ${pluginId} is not enabled for tenant ${tenantId}`,
        { pluginId, tenantId }
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Cascade operations
  // ---------------------------------------------------------------------------

  /**
   * Bulk-disable all workspace plugin records for a given plugin within a
   * tenant when the tenant-level plugin is disabled (FR-026).
   *
   * Returns the number of workspace plugin records updated.
   */
  async cascadeDisableForTenantPlugin(pluginId: string, tenantId: string): Promise<number> {
    this.logger.info(
      { pluginId, tenantId },
      'workspace-plugin: cascade-disabling all workspace plugins for tenant plugin'
    );

    const result = await this.db.$executeRaw(
      Prisma.sql`UPDATE workspace_plugins wp
                 SET enabled = false, updated_at = NOW()
                 FROM workspaces w
                 WHERE wp.workspace_id = w.id
                   AND wp.plugin_id = ${pluginId}
                   AND w.tenant_id = ${tenantId}::uuid
                   AND wp.enabled = true`
    );

    this.logger.info(
      { pluginId, tenantId, affectedRows: result },
      'workspace-plugin: cascade disable complete'
    );

    return result;
  }
}

/** Singleton instance for production use */
export const workspacePluginService = new WorkspacePluginService();
