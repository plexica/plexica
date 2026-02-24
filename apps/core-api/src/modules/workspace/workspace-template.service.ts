// apps/core-api/src/modules/workspace/workspace-template.service.ts
//
// Template CRUD and transactional template application during workspace creation.
// Implements Spec 011 Phase 2 — FR-015, FR-016, FR-017, FR-018, FR-019, FR-020,
// FR-021, FR-022.
//
// IMPORTANT: applyTemplate() MUST be called within an existing Prisma transaction.
// All queries use Prisma.$queryRaw / Prisma.sql (no string interpolation).

import { PrismaClient, Prisma } from '@plexica/database';
import { db } from '../../lib/db.js';
import { logger as rootLogger } from '../../lib/logger.js';
import type { Logger } from 'pino';
import { WorkspaceError, WorkspaceErrorCode } from './utils/error-formatter.js';
import type { WorkspacePluginService } from './workspace-plugin.service.js';
import type { RegisterTemplateDto } from '../plugin/dto/register-template.dto.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  provided_by_plugin_id: string;
  is_default: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  item_count: bigint | number;
}

export interface TemplateItemRow {
  id: string;
  template_id: string;
  type: 'plugin' | 'page' | 'setting';
  plugin_id: string | null;
  page_config: Record<string, unknown> | null;
  setting_key: string | null;
  setting_value: unknown | null;
  sort_order: number;
  created_at: Date;
}

export interface TemplateWithItems {
  id: string;
  name: string;
  description: string | null;
  provided_by_plugin_id: string;
  is_default: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  items: TemplateItemRow[];
}

// Re-export for consumers that import from this module
export type { RegisterTemplateDto } from '../plugin/dto/register-template.dto.js';

/** Minimal Prisma transaction client shape */

type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Minimal interface required by fetchTemplateWithItems.
 * Both PrismaClient and PrismaTransaction structurally satisfy this interface,
 * avoiding the need for `as unknown as` double-casts.
 */
interface PrismaQueryable {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
}

/**
 * Manages workspace templates: listing, retrieval, and transactional application.
 *
 * Templates are provided by plugins and list the plugins, settings, and pages
 * to scaffold when a workspace is created from that template.
 *
 * Template application is fully transactional — if any item fails to apply,
 * the entire workspace creation rolls back.
 */
export class WorkspaceTemplateService {
  private readonly db: PrismaClient;
  private readonly logger: Logger;
  private readonly pluginService?: WorkspacePluginService;

  constructor(
    customDb?: PrismaClient,
    pluginService?: WorkspacePluginService,
    customLogger?: Logger
  ) {
    this.db = customDb ?? db;
    this.pluginService = pluginService;
    this.logger = customLogger ?? rootLogger;
  }

  // ---------------------------------------------------------------------------
  // Template listing & retrieval (FR-021, FR-022)
  // ---------------------------------------------------------------------------

  /**
   * List all templates available to a tenant.
   *
   * Only returns templates whose providing plugin is enabled for the tenant.
   * Ordered by name ascending.
   */
  async listTemplates(tenantId: string): Promise<TemplateListItem[]> {
    this.logger.debug({ tenantId }, 'workspace-template: listing templates');

    const rows = await this.db.$queryRaw<TemplateListItem[]>(
      Prisma.sql`SELECT wt.id, wt.name, wt.description, wt.provided_by_plugin_id,
                        wt.is_default, wt.metadata, wt.created_at,
                        COALESCE(ic.cnt, 0) AS item_count
                   FROM workspace_templates wt
                   JOIN tenant_plugins tp ON tp."pluginId" = wt.provided_by_plugin_id
                   LEFT JOIN (
                     SELECT template_id, COUNT(*) AS cnt
                       FROM workspace_template_items
                      GROUP BY template_id
                   ) ic ON ic.template_id = wt.id
                  WHERE tp."tenantId" = ${tenantId}
                    AND tp.enabled = true
                  ORDER BY wt.name ASC`
    );

    // Normalise BigInt item_count to number for serialisation
    return rows.map((r) => ({ ...r, item_count: Number(r.item_count) }));
  }

  /**
   * Get a single template with its items, ordered by sort_order.
   *
   * Requires tenantId to ensure the providing plugin is enabled for the
   * requesting tenant — prevents cross-tenant information disclosure.
   *
   * Throws TEMPLATE_NOT_FOUND if no template with that ID exists or the
   * template's plugin is not enabled for the tenant.
   */
  async getTemplate(templateId: string, tenantId: string): Promise<TemplateWithItems> {
    this.logger.debug({ templateId, tenantId }, 'workspace-template: getting template');

    const templateRows = await this.db.$queryRaw<
      Array<{
        id: string;
        name: string;
        description: string | null;
        provided_by_plugin_id: string;
        is_default: boolean;
        metadata: Record<string, unknown>;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      Prisma.sql`SELECT wt.id, wt.name, wt.description, wt.provided_by_plugin_id,
                        wt.is_default, wt.metadata, wt.created_at, wt.updated_at
                   FROM workspace_templates wt
                   JOIN tenant_plugins tp ON tp."pluginId" = wt.provided_by_plugin_id
                  WHERE wt.id = ${templateId}
                    AND tp."tenantId" = ${tenantId}
                    AND tp.enabled = true
                  LIMIT 1`
    );

    if (templateRows.length === 0) {
      throw new WorkspaceError(
        WorkspaceErrorCode.TEMPLATE_NOT_FOUND,
        `Template ${templateId} not found`,
        { templateId }
      );
    }

    const itemRows = await this.db.$queryRaw<TemplateItemRow[]>(
      Prisma.sql`SELECT id, template_id, type, plugin_id, page_config,
                        setting_key, setting_value, sort_order, created_at
                   FROM workspace_template_items
                  WHERE template_id = ${templateId}
                  ORDER BY sort_order ASC, created_at ASC`
    );

    return { ...templateRows[0], items: itemRows };
  }

  // ---------------------------------------------------------------------------
  // Template application (FR-015, FR-016, FR-017, FR-018, FR-019)
  // ---------------------------------------------------------------------------

  /**
   * Apply a template to a newly-created workspace within an ongoing transaction.
   *
   * MUST be called within an existing Prisma.$transaction — do NOT call from
   * outside a transaction. Any failure throws and causes the transaction to
   * roll back, preventing orphan workspace records.
   *
   * @param workspaceId - ID of the freshly-created workspace
   * @param templateId  - ID of the template to apply
   * @param tenantId    - Owning tenant ID (for plugin validation)
   * @param tx          - Active Prisma transaction client
   * @param schemaName  - Tenant schema name (for fully-qualified table references)
   */
  async applyTemplate(
    workspaceId: string,
    templateId: string,
    tenantId: string,
    tx: PrismaTransaction,
    schemaName: string
  ): Promise<void> {
    this.logger.debug(
      { workspaceId, templateId, tenantId },
      'workspace-template: applying template'
    );

    // 1. Fetch template with items
    const template = await this.fetchTemplateWithItems(tx, templateId);
    if (!template) {
      throw new WorkspaceError(
        WorkspaceErrorCode.TEMPLATE_NOT_FOUND,
        `Template ${templateId} not found`,
        { templateId }
      );
    }

    // 2. Validate all plugin-type items have enabled tenant plugins
    await this.validateTemplatePluginsInTx(template, tenantId, tx);

    // 3. Apply items in sort_order
    for (const item of template.items) {
      switch (item.type) {
        case 'plugin':
          await this.applyPluginItem(workspaceId, item, tx);
          break;
        case 'setting':
          await this.applySettingItem(workspaceId, item, tx, schemaName);
          break;
        case 'page':
          await this.applyPageItem(workspaceId, item, tx);
          break;
        default: {
          const exhaustive: never = item.type;
          throw new WorkspaceError(
            WorkspaceErrorCode.VALIDATION_ERROR,
            `Unknown template item type: ${exhaustive}`
          );
        }
      }
    }

    this.logger.info(
      { workspaceId, templateId, tenantId, itemCount: template.items.length },
      'workspace-template: template applied'
    );
  }

  // ---------------------------------------------------------------------------
  // Plugin template registration (FR-028) — T011-15
  // ---------------------------------------------------------------------------

  /**
   * Register a template provided by a plugin.
   *
   * Inserts a new row in workspace_templates and the corresponding items in
   * workspace_template_items. All within a single transaction so partial
   * inserts cannot occur.
   *
   * @param pluginId - ID of the plugin registering the template
   * @param dto      - Validated RegisterTemplateDto from request body
   */
  async registerTemplate(pluginId: string, dto: RegisterTemplateDto): Promise<TemplateWithItems> {
    this.logger.debug({ pluginId, name: dto.name }, 'workspace-template: registering template');

    if (dto.items.length > 50) {
      throw new WorkspaceError(
        WorkspaceErrorCode.TEMPLATE_ITEM_LIMIT_EXCEEDED,
        `Template item count ${dto.items.length} exceeds maximum of 50`,
        { count: dto.items.length }
      );
    }

    const newId = await this.db.$transaction(async (tx) => {
      // Insert template row
      const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`INSERT INTO workspace_templates
                     (id, name, description, provided_by_plugin_id, is_default, metadata,
                      created_at, updated_at)
                   VALUES
                     (gen_random_uuid(), ${dto.name}, ${dto.description ?? null},
                      ${pluginId}, ${dto.isDefault ?? false},
                      ${JSON.stringify(dto.metadata ?? {})}::jsonb,
                      NOW(), NOW())
                   RETURNING id`
      );
      const templateId = rows[0].id;

      // Insert items
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];
        const sortOrder = item.sortOrder ?? i;

        if (item.type === 'plugin') {
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO workspace_template_items
                         (id, template_id, type, plugin_id, page_config,
                          setting_key, setting_value, sort_order, created_at)
                       VALUES
                         (gen_random_uuid(), ${templateId}, 'plugin',
                          ${item.pluginId}, NULL, NULL, NULL, ${sortOrder}, NOW())`
          );
        } else if (item.type === 'setting') {
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO workspace_template_items
                         (id, template_id, type, plugin_id, page_config,
                          setting_key, setting_value, sort_order, created_at)
                       VALUES
                         (gen_random_uuid(), ${templateId}, 'setting',
                          NULL, NULL, ${item.settingKey},
                          ${JSON.stringify(item.settingValue ?? null)}::jsonb,
                          ${sortOrder}, NOW())`
          );
        } else {
          // page
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO workspace_template_items
                         (id, template_id, type, plugin_id, page_config,
                          setting_key, setting_value, sort_order, created_at)
                       VALUES
                         (gen_random_uuid(), ${templateId}, 'page',
                          NULL, ${JSON.stringify(item.pageConfig)}::jsonb,
                          NULL, NULL, ${sortOrder}, NOW())`
          );
        }
      }

      return templateId;
    });

    // Use internal fetch (no tenant check needed — we just wrote the record)
    return this.getTemplateInternal(newId);
  }

  /**
   * Replace all items of an existing plugin-provided template.
   *
   * Only the plugin that originally created the template may update it.
   * All existing items are deleted and replaced atomically.
   *
   * @param pluginId   - ID of the plugin owning the template
   * @param templateId - ID of the template to update
   * @param dto        - Validated RegisterTemplateDto from request body
   */
  async updateTemplate(
    pluginId: string,
    templateId: string,
    dto: RegisterTemplateDto
  ): Promise<TemplateWithItems> {
    this.logger.debug(
      { pluginId, templateId, name: dto.name },
      'workspace-template: updating template'
    );

    if (dto.items.length > 50) {
      throw new WorkspaceError(
        WorkspaceErrorCode.TEMPLATE_ITEM_LIMIT_EXCEEDED,
        `Template item count ${dto.items.length} exceeds maximum of 50`,
        { count: dto.items.length }
      );
    }

    await this.db.$transaction(async (tx) => {
      // Verify template exists and is owned by this plugin
      const rows = await tx.$queryRaw<Array<{ provided_by_plugin_id: string }>>(
        Prisma.sql`SELECT provided_by_plugin_id
                     FROM workspace_templates
                    WHERE id = ${templateId}
                    LIMIT 1`
      );

      if (rows.length === 0) {
        throw new WorkspaceError(
          WorkspaceErrorCode.TEMPLATE_NOT_FOUND,
          `Template ${templateId} not found`,
          { templateId }
        );
      }

      if (rows[0].provided_by_plugin_id !== pluginId) {
        throw new WorkspaceError(
          WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
          `Plugin ${pluginId} does not own template ${templateId}`,
          { pluginId, templateId }
        );
      }

      // Update template metadata
      await tx.$executeRaw(
        Prisma.sql`UPDATE workspace_templates
                      SET name        = ${dto.name},
                          description = ${dto.description ?? null},
                          is_default  = ${dto.isDefault ?? false},
                          metadata    = ${JSON.stringify(dto.metadata ?? {})}::jsonb,
                          updated_at  = NOW()
                    WHERE id = ${templateId}`
      );

      // Delete all existing items
      await tx.$executeRaw(
        Prisma.sql`DELETE FROM workspace_template_items
                    WHERE template_id = ${templateId}`
      );

      // Insert new items
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];
        const sortOrder = item.sortOrder ?? i;

        if (item.type === 'plugin') {
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO workspace_template_items
                         (id, template_id, type, plugin_id, page_config,
                          setting_key, setting_value, sort_order, created_at)
                       VALUES
                         (gen_random_uuid(), ${templateId}, 'plugin',
                          ${item.pluginId}, NULL, NULL, NULL, ${sortOrder}, NOW())`
          );
        } else if (item.type === 'setting') {
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO workspace_template_items
                         (id, template_id, type, plugin_id, page_config,
                          setting_key, setting_value, sort_order, created_at)
                       VALUES
                         (gen_random_uuid(), ${templateId}, 'setting',
                          NULL, NULL, ${item.settingKey},
                          ${JSON.stringify(item.settingValue ?? null)}::jsonb,
                          ${sortOrder}, NOW())`
          );
        } else {
          // page
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO workspace_template_items
                         (id, template_id, type, plugin_id, page_config,
                          setting_key, setting_value, sort_order, created_at)
                       VALUES
                         (gen_random_uuid(), ${templateId}, 'page',
                          NULL, ${JSON.stringify(item.pageConfig)}::jsonb,
                          NULL, NULL, ${sortOrder}, NOW())`
          );
        }
      }
    });

    // Use internal fetch (no tenant check needed — we just wrote the record)
    return this.getTemplateInternal(templateId);
  }

  /**
   * Delete a plugin-provided template and all its items (via CASCADE FK).
   *
   * Only the plugin that originally created the template may delete it.
   *
   * @param pluginId   - ID of the plugin owning the template
   * @param templateId - ID of the template to delete
   */
  async deleteTemplate(pluginId: string, templateId: string): Promise<void> {
    this.logger.debug({ pluginId, templateId }, 'workspace-template: deleting template');

    // Atomic ownership check + delete in a single statement to avoid TOCTOU race.
    // Returns the deleted row id if the plugin owns the template, empty if not.
    // CASCADE FK on workspace_template_items deletes items automatically.
    const deleted = await this.db.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`DELETE FROM workspace_templates
                  WHERE id = ${templateId}
                    AND provided_by_plugin_id = ${pluginId}
                 RETURNING id`
    );

    if (deleted.length === 0) {
      // Distinguish "not found" from "wrong owner" — check existence first for
      // a helpful error message, but keep it as a single extra query only on
      // the failure path (happy path is single-round-trip).
      const exists = await this.db.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM workspace_templates WHERE id = ${templateId} LIMIT 1`
      );
      if (exists.length === 0) {
        throw new WorkspaceError(
          WorkspaceErrorCode.TEMPLATE_NOT_FOUND,
          `Template ${templateId} not found`,
          { templateId }
        );
      }
      throw new WorkspaceError(
        WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS,
        `Plugin ${pluginId} does not own template ${templateId}`,
        { pluginId, templateId }
      );
    }

    this.logger.info({ pluginId, templateId }, 'workspace-template: template deleted');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch template and items within a transaction context (or plain db client).
   * Accepts PrismaQueryable so both PrismaClient and PrismaTransaction can be
   * passed without unsafe double-casting.
   */
  private async fetchTemplateWithItems(
    tx: PrismaQueryable,
    templateId: string
  ): Promise<TemplateWithItems | null> {
    const templateRows = await tx.$queryRaw<
      Array<{
        id: string;
        name: string;
        description: string | null;
        provided_by_plugin_id: string;
        is_default: boolean;
        metadata: Record<string, unknown>;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      Prisma.sql`SELECT id, name, description, provided_by_plugin_id, is_default,
                        metadata, created_at, updated_at
                   FROM workspace_templates
                  WHERE id = ${templateId}
                  LIMIT 1`
    );

    if (templateRows.length === 0) {
      return null;
    }

    const itemRows = await tx.$queryRaw<TemplateItemRow[]>(
      Prisma.sql`SELECT id, template_id, type, plugin_id, page_config,
                        setting_key, setting_value, sort_order, created_at
                   FROM workspace_template_items
                  WHERE template_id = ${templateId}
                  ORDER BY sort_order ASC, created_at ASC`
    );

    return { ...templateRows[0], items: itemRows };
  }

  /**
   * Fetch a template with items using the instance DB client (no tenant check).
   *
   * For INTERNAL use only — called after a write operation where we already hold
   * ownership of the record (registerTemplate, updateTemplate). The public
   * getTemplate() enforces tenant scoping; this method intentionally skips it
   * because the tenant check is guaranteed by the write transaction above.
   */
  private async getTemplateInternal(templateId: string): Promise<TemplateWithItems> {
    // PrismaClient satisfies PrismaQueryable structurally — no cast needed.
    const result = await this.fetchTemplateWithItems(this.db, templateId);
    if (!result) {
      throw new WorkspaceError(
        WorkspaceErrorCode.TEMPLATE_NOT_FOUND,
        `Template ${templateId} not found after write`,
        { templateId }
      );
    }
    return result;
  }

  /**
   * Validate all plugin-type template items are tenant-enabled.
   * Uses the transaction client to stay within the same transaction.
   *
   * Performance: single batched query instead of one query per plugin item
   * (avoids N+1 inside the transaction — plan.md §14.3).
   */
  private async validateTemplatePluginsInTx(
    template: TemplateWithItems,
    tenantId: string,
    tx: PrismaTransaction
  ): Promise<void> {
    const pluginItems = template.items.filter((i) => i.type === 'plugin' && i.plugin_id);
    if (pluginItems.length === 0) return;

    const pluginIds = pluginItems.map((i) => i.plugin_id!);

    // Single query: fetch enabled status for all required plugins at once.
    const rows = await tx.$queryRaw<Array<{ plugin_id: string; enabled: boolean }>>(
      Prisma.sql`SELECT "pluginId" AS plugin_id, enabled
                   FROM tenant_plugins
                  WHERE "tenantId" = ${tenantId}
                    AND "pluginId" = ANY(${pluginIds}::text[])`
    );

    const enabledSet = new Set(rows.filter((r) => r.enabled).map((r) => r.plugin_id));

    for (const item of pluginItems) {
      const pluginId = item.plugin_id!;
      if (!enabledSet.has(pluginId)) {
        throw new WorkspaceError(
          WorkspaceErrorCode.TEMPLATE_PLUGIN_NOT_INSTALLED,
          `Template requires plugin ${pluginId} which is not enabled for tenant ${tenantId}`,
          { pluginId, tenantId, templateId: template.id }
        );
      }
    }
  }

  /**
   * Apply a 'plugin' template item: create a WorkspacePlugin record.
   */
  private async applyPluginItem(
    workspaceId: string,
    item: TemplateItemRow,
    tx: PrismaTransaction
  ): Promise<void> {
    if (!item.plugin_id) {
      throw new WorkspaceError(
        WorkspaceErrorCode.VALIDATION_ERROR,
        `Template item ${item.id} of type 'plugin' is missing plugin_id`
      );
    }

    await tx.$executeRaw(
      Prisma.sql`INSERT INTO workspace_plugins
                   (workspace_id, plugin_id, enabled, configuration, created_at, updated_at)
                 VALUES
                   (${workspaceId}, ${item.plugin_id}, true, '{}'::jsonb, NOW(), NOW())
                 ON CONFLICT (workspace_id, plugin_id) DO NOTHING`
    );
  }

  /**
   * Apply a 'setting' template item: merge key/value into workspace settings JSON.
   *
   * Uses a fully-qualified table name to avoid implicit search_path coupling.
   */
  private async applySettingItem(
    workspaceId: string,
    item: TemplateItemRow,
    tx: PrismaTransaction,
    schemaName: string
  ): Promise<void> {
    if (!item.setting_key) {
      throw new WorkspaceError(
        WorkspaceErrorCode.VALIDATION_ERROR,
        `Template item ${item.id} of type 'setting' is missing setting_key`
      );
    }

    const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
    const settingValueJson = JSON.stringify(item.setting_value ?? null);
    // Merge using jsonb || operator — sets the key, preserving other settings
    await tx.$executeRaw(
      Prisma.sql`UPDATE ${workspacesTable}
                    SET settings = settings || jsonb_build_object(${item.setting_key}, ${settingValueJson}::jsonb),
                        updated_at = NOW()
                  WHERE id = ${workspaceId}`
    );
  }

  /**
   * Apply a 'page' template item: create a WorkspacePage record.
   */
  private async applyPageItem(
    workspaceId: string,
    item: TemplateItemRow,
    tx: PrismaTransaction
  ): Promise<void> {
    const pageConfig = item.page_config ?? {};
    const slug = (pageConfig as Record<string, unknown>)['slug'] as string | undefined;
    const title = (pageConfig as Record<string, unknown>)['title'] as string | undefined;

    if (!slug || !title) {
      throw new WorkspaceError(
        WorkspaceErrorCode.VALIDATION_ERROR,
        `Template item ${item.id} of type 'page' requires page_config.slug and page_config.title`
      );
    }

    const configJson = JSON.stringify(pageConfig);
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO workspace_pages
                   (id, workspace_id, slug, title, config, sort_order, created_at, updated_at)
                 VALUES
                   (gen_random_uuid(), ${workspaceId}, ${slug}, ${title},
                    ${configJson}::jsonb, ${item.sort_order}, NOW(), NOW())
                 ON CONFLICT (workspace_id, slug) DO NOTHING`
    );
  }
}

/** Singleton instance for production use */
export const workspaceTemplateService = new WorkspaceTemplateService();
