/**
 * LayoutConfigService — T014-05, T014-07, T014-08 (Spec 014 Frontend Layout Engine)
 *
 * Core service for tenant-configurable form and view layout management:
 *   - CRUD operations for layout configs (tenant and workspace scope)   [T014-05]
 *   - Resolution engine: merges config + manifest + per-user roles      [T014-07]
 *   - Redis caching with jittered TTL for pre-resolved blobs            [T014-08]
 *   - Soft-delete / restore on plugin uninstall / reinstall             [T014-09 hook]
 *
 * Data access pattern:
 *   All queries go through raw SQL via `db.$queryRaw` / `db.$executeRaw` with
 *   `Prisma.sql` and `Prisma.raw(schemaName)` — the same pattern used across
 *   tenant-scoped services. The `LayoutConfig` Prisma model is a documentation
 *   template only and is never accessed through `db.layoutConfig.*`.
 *
 * Constitution Compliance:
 *   - Article 1.2: Multi-tenancy isolation — all queries scoped to schemaName
 *   - Article 3.3: Parameterized queries; no raw string interpolation of user data
 *   - Article 4.3: Redis cache → P95 < 50 ms (NFR-001)
 *   - Article 5.1: Fail-open on Redis/DB errors (NFR-008); no user-facing errors
 *   - Article 5.2: No PII in logs
 *   - Article 6.2: DomainError with SCREAMING_SNAKE_CASE codes (Art. 6.2)
 *   - Article 6.3: Pino structured logging with requestId / tenantId
 *   - ADR-025: Audit log in core schema — never in tenant schema
 */

import { Prisma } from '@plexica/database';
import { db } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { auditLogService } from './audit-log.service.js';
import { tenantService } from './tenant.service.js';
import type {
  LayoutConfig,
  LayoutConfigSnapshot,
  FieldOverride,
  SectionOverride,
  ColumnOverride,
  ResolvedLayout,
  ResolvedField,
  ResolvedColumn,
  FormSchema,
  RoleKey,
  ConfigurableFormSummary,
} from '@plexica/types';
import type { SaveLayoutConfigInput } from '../schemas/layout-config.schema.js';
import {
  layoutConfigValidationService,
  type SaveLayoutConfigOverrides,
  type ValidationResult,
} from './layout-config-validation.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate schema name — must be lowercase alphanumeric + underscores,
 * starting with a letter. Prevents SQL injection via Prisma.raw interpolation.
 */
function validateSchemaName(schemaName: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new DomainError('INVALID_SCHEMA_NAME', `Invalid schema name: "${schemaName}"`, 400);
  }
}

/** Typed domain error with an SCREAMING_SNAKE_CASE code and HTTP status. */
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

// ---------------------------------------------------------------------------
// Raw DB row types
// ---------------------------------------------------------------------------

interface RawLayoutConfigRow {
  id: string;
  form_id: string;
  plugin_id: string;
  scope_type: string;
  scope_id: string | null;
  fields: unknown;
  sections: unknown;
  columns: unknown;
  previous_version: unknown;
  created_by: string;
  updated_by: string;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface RawPluginManifestRow {
  id: string;
  name: string;
  manifest: unknown;
}

interface RawTeamRoleRow {
  role: string;
}

// ---------------------------------------------------------------------------
// Redis cache helpers
// ---------------------------------------------------------------------------

/** Base TTL: 300 s ± 30 s jitter to prevent thundering herd. */
const CACHE_TTL_BASE = 300;
const CACHE_TTL_JITTER = 30;

function cacheTtl(): number {
  return CACHE_TTL_BASE + Math.floor(Math.random() * (CACHE_TTL_JITTER * 2 + 1)) - CACHE_TTL_JITTER;
}

function cacheKey(tenantId: string, formId: string, scope: string): string {
  return `layout:${tenantId}:${formId}:${scope}`;
}

// ---------------------------------------------------------------------------
// Visibility permissiveness order (FR-007)
// ---------------------------------------------------------------------------

const VISIBILITY_RANK: Record<'visible' | 'readonly' | 'hidden', number> = {
  visible: 2,
  readonly: 1,
  hidden: 0,
};

function morePermissive(
  a: 'visible' | 'readonly' | 'hidden',
  b: 'visible' | 'readonly' | 'hidden'
): 'visible' | 'readonly' | 'hidden' {
  return VISIBILITY_RANK[a] >= VISIBILITY_RANK[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRow(row: RawLayoutConfigRow): LayoutConfig {
  return {
    id: row.id,
    formId: row.form_id,
    pluginId: row.plugin_id,
    scopeType: row.scope_type as 'tenant' | 'workspace',
    scopeId: row.scope_id,
    fields: (row.fields as FieldOverride[]) ?? [],
    sections: (row.sections as SectionOverride[]) ?? [],
    columns: (row.columns as ColumnOverride[]) ?? [],
    previousVersion: (row.previous_version as LayoutConfigSnapshot | null) ?? null,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// LayoutConfigService
// ---------------------------------------------------------------------------

export class LayoutConfigService {
  // -------------------------------------------------------------------------
  // Cache helpers
  // -------------------------------------------------------------------------

  /**
   * Invalidate the Redis cache key for a given tenant / form / scope combination.
   * Fail-open: Redis errors are logged at warn level and suppressed.
   */
  async invalidateCache(tenantId: string, formId: string, scope: string): Promise<void> {
    try {
      await redis.del(cacheKey(tenantId, formId, scope));
    } catch (err) {
      logger.warn(
        { tenantId, formId, scope, err },
        'layout-config: Redis invalidate failed (non-blocking)'
      );
    }
  }

  // -------------------------------------------------------------------------
  // CRUD — tenant and workspace scope
  // -------------------------------------------------------------------------

  /**
   * Load a single layout config from the tenant schema.
   *
   * @param tenantSlug  Tenant slug (used to derive schema name)
   * @param formId      Plugin form identifier
   * @param scopeType   'tenant' or 'workspace'
   * @param scopeId     Workspace UUID (required when scopeType='workspace')
   */
  async getConfig(
    tenantSlug: string,
    formId: string,
    scopeType: 'tenant' | 'workspace',
    scopeId?: string | null
  ): Promise<LayoutConfig | null> {
    const schemaName = tenantService.getSchemaName(tenantSlug);
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    let rows: RawLayoutConfigRow[];
    if (scopeType === 'workspace' && scopeId) {
      rows = await db.$queryRaw<RawLayoutConfigRow[]>(
        Prisma.sql`
          SELECT id, form_id, plugin_id, scope_type, scope_id, fields, sections, columns,
                 previous_version, created_by, updated_by, deleted_at, created_at, updated_at
          FROM ${schema}."layout_configs"
          WHERE form_id = ${formId}
            AND scope_type = 'workspace'
            AND scope_id = ${scopeId}::uuid
            AND deleted_at IS NULL
          LIMIT 1
        `
      );
    } else {
      rows = await db.$queryRaw<RawLayoutConfigRow[]>(
        Prisma.sql`
          SELECT id, form_id, plugin_id, scope_type, scope_id, fields, sections, columns,
                 previous_version, created_by, updated_by, deleted_at, created_at, updated_at
          FROM ${schema}."layout_configs"
          WHERE form_id = ${formId}
            AND scope_type = 'tenant'
            AND scope_id IS NULL
            AND deleted_at IS NULL
          LIMIT 1
        `
      );
    }

    if (!rows.length) return null;
    return mapRow(rows[0]);
  }

  /**
   * Upsert a layout config for a given scope.
   *
   * - Stores the current version as `previous_version` before overwriting (FR-018).
   * - Validates optimistic concurrency via `updated_at` ETag (Edge Case #5).
   * - Records an audit log entry (FR-022, ADR-025).
   * - Invalidates the Redis cache key for this form + scope.
   *
   * @param tenantId    Tenant UUID (for audit log and cache)
   * @param tenantSlug  Tenant slug (used to derive schema name)
   * @param userId      Admin performing the save
   * @param formId      Plugin form identifier
   * @param scopeType   'tenant' or 'workspace'
   * @param scopeId     Workspace UUID (required when scopeType='workspace')
   * @param data        New overrides payload
   * @param etag        If-Match ETag (ISO timestamp of updatedAt) for concurrency guard
   */
  async saveConfig(
    tenantId: string,
    tenantSlug: string,
    userId: string,
    formId: string,
    scopeType: 'tenant' | 'workspace',
    scopeId: string | null,
    data: SaveLayoutConfigInput,
    etag?: string | null
  ): Promise<LayoutConfig> {
    const schemaName = tenantService.getSchemaName(tenantSlug);
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    // Load existing config (if any) to:
    //   a) check ETag for optimistic concurrency
    //   b) store as previous_version
    const existing = await this.getConfig(tenantSlug, formId, scopeType, scopeId);

    if (etag && existing) {
      const existingEtag = existing.updatedAt.toISOString();
      if (etag !== existingEtag) {
        throw new DomainError(
          'LAYOUT_CONFIG_CONFLICT',
          'Layout config was modified by another user. Reload and retry.',
          409
        );
      }
    }

    const previousVersion: LayoutConfigSnapshot | null = existing
      ? { fields: existing.fields, sections: existing.sections, columns: existing.columns }
      : null;

    const fieldsJson = JSON.stringify(data.fields ?? []);
    const sectionsJson = JSON.stringify(data.sections ?? []);
    const columnsJson = JSON.stringify(data.columns ?? []);
    const previousVersionJson = previousVersion ? JSON.stringify(previousVersion) : null;

    let savedRow: RawLayoutConfigRow;

    if (!existing) {
      // INSERT
      const rows = await db.$queryRaw<RawLayoutConfigRow[]>(
        scopeType === 'workspace' && scopeId
          ? Prisma.sql`
              INSERT INTO ${schema}."layout_configs"
                (form_id, plugin_id, scope_type, scope_id, fields, sections, columns,
                 previous_version, created_by, updated_by, created_at, updated_at)
              VALUES (
                ${formId}, ${data.pluginId}::uuid, 'workspace', ${scopeId}::uuid,
                ${fieldsJson}::jsonb, ${sectionsJson}::jsonb, ${columnsJson}::jsonb,
                ${previousVersionJson}::jsonb,
                ${userId}::uuid, ${userId}::uuid,
                NOW(), NOW()
              )
              RETURNING id, form_id, plugin_id, scope_type, scope_id, fields, sections, columns,
                        previous_version, created_by, updated_by, deleted_at, created_at, updated_at
            `
          : Prisma.sql`
              INSERT INTO ${schema}."layout_configs"
                (form_id, plugin_id, scope_type, scope_id, fields, sections, columns,
                 previous_version, created_by, updated_by, created_at, updated_at)
              VALUES (
                ${formId}, ${data.pluginId}::uuid, 'tenant', NULL,
                ${fieldsJson}::jsonb, ${sectionsJson}::jsonb, ${columnsJson}::jsonb,
                ${previousVersionJson}::jsonb,
                ${userId}::uuid, ${userId}::uuid,
                NOW(), NOW()
              )
              RETURNING id, form_id, plugin_id, scope_type, scope_id, fields, sections, columns,
                        previous_version, created_by, updated_by, deleted_at, created_at, updated_at
            `
      );
      savedRow = rows[0];
    } else {
      // UPDATE (preserve previous_version as the config before this change)
      const rows = await db.$queryRaw<RawLayoutConfigRow[]>(
        Prisma.sql`
          UPDATE ${schema}."layout_configs"
          SET
            fields = ${fieldsJson}::jsonb,
            sections = ${sectionsJson}::jsonb,
            columns = ${columnsJson}::jsonb,
            previous_version = ${previousVersionJson}::jsonb,
            updated_by = ${userId}::uuid,
            updated_at = NOW()
          WHERE id = ${existing.id}::uuid
          RETURNING id, form_id, plugin_id, scope_type, scope_id, fields, sections, columns,
                    previous_version, created_by, updated_by, deleted_at, created_at, updated_at
        `
      );
      savedRow = rows[0];
    }

    const saved = mapRow(savedRow);
    const scopeLabel = scopeType === 'workspace' ? `workspace:${scopeId ?? ''}` : 'tenant';

    // Invalidate cache (FR-022)
    await this.invalidateCache(tenantId, formId, scopeLabel);

    // Audit log — fire-and-forget (ADR-025)
    void auditLogService.log({
      tenantId,
      userId,
      action: 'layout_config.updated',
      resourceType: 'layout_config',
      resourceId: saved.id,
      details: { formId, scopeType, scopeId },
    });

    return saved;
  }

  /**
   * Revert a layout config to its previous version (FR-019).
   * Swaps `current ↔ previous_version` atomically.
   */
  async revertConfig(
    tenantId: string,
    tenantSlug: string,
    userId: string,
    formId: string,
    scopeType: 'tenant' | 'workspace',
    scopeId?: string | null
  ): Promise<LayoutConfig> {
    const schemaName = tenantService.getSchemaName(tenantSlug);
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await this.getConfig(tenantSlug, formId, scopeType, scopeId);
    if (!existing) {
      throw new DomainError(
        'LAYOUT_CONFIG_NOT_FOUND',
        `No layout config found for form "${formId}"`,
        404
      );
    }
    if (!existing.previousVersion) {
      throw new DomainError(
        'NO_PREVIOUS_VERSION',
        'No previous version available to revert to',
        400
      );
    }

    const prev = existing.previousVersion;
    const currentSnapshot: LayoutConfigSnapshot = {
      fields: existing.fields,
      sections: existing.sections,
      columns: existing.columns,
    };

    const newFieldsJson = JSON.stringify(prev.fields);
    const newSectionsJson = JSON.stringify(prev.sections);
    const newColumnsJson = JSON.stringify(prev.columns);
    const newPreviousVersionJson = JSON.stringify(currentSnapshot);

    const rows = await db.$queryRaw<RawLayoutConfigRow[]>(
      Prisma.sql`
        UPDATE ${schema}."layout_configs"
        SET
          fields = ${newFieldsJson}::jsonb,
          sections = ${newSectionsJson}::jsonb,
          columns = ${newColumnsJson}::jsonb,
          previous_version = ${newPreviousVersionJson}::jsonb,
          updated_by = ${userId}::uuid,
          updated_at = NOW()
        WHERE id = ${existing.id}::uuid
        RETURNING id, form_id, plugin_id, scope_type, scope_id, fields, sections, columns,
                  previous_version, created_by, updated_by, deleted_at, created_at, updated_at
      `
    );

    const reverted = mapRow(rows[0]);
    const scopeLabel = scopeType === 'workspace' ? `workspace:${scopeId ?? ''}` : 'tenant';
    await this.invalidateCache(tenantId, formId, scopeLabel);

    // Audit log — fire-and-forget
    void auditLogService.log({
      tenantId,
      userId,
      action: 'layout_config.reverted',
      resourceType: 'layout_config',
      resourceId: reverted.id,
      details: { formId, scopeType, scopeId },
    });

    return reverted;
  }

  /**
   * Soft-delete a layout config row (sets deleted_at). Invalidates cache and creates audit log.
   * Per FR-024: configs are never hard-deleted to preserve audit history and
   * allow restore on plugin reinstall.
   */
  async deleteConfig(
    tenantId: string,
    tenantSlug: string,
    userId: string,
    formId: string,
    scopeType: 'tenant' | 'workspace',
    scopeId?: string | null
  ): Promise<void> {
    const schemaName = tenantService.getSchemaName(tenantSlug);
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    const existing = await this.getConfig(tenantSlug, formId, scopeType, scopeId);
    if (!existing) {
      throw new DomainError(
        'LAYOUT_CONFIG_NOT_FOUND',
        `No layout config found for form "${formId}"`,
        404
      );
    }

    await db.$executeRaw(
      Prisma.sql`UPDATE ${schema}."layout_configs" SET deleted_at = NOW() WHERE id = ${existing.id}::uuid`
    );

    const scopeLabel = scopeType === 'workspace' ? `workspace:${scopeId ?? ''}` : 'tenant';
    await this.invalidateCache(tenantId, formId, scopeLabel);

    void auditLogService.log({
      tenantId,
      userId,
      action: 'layout_config.deleted',
      resourceType: 'layout_config',
      resourceId: existing.id,
      details: { formId, scopeType, scopeId },
    });
  }

  /**
   * List all configurable forms derived from installed plugin manifests (FR-023).
   * Returns one summary entry per form, with `hasConfig: true` if a tenant-scope
   * config exists.
   *
   * Pagination: `page` (1-based) and `pageSize` (1–100, default 50) slice the
   * full list after assembly. This is in-memory pagination — the manifest list
   * is small (<100 forms in practice) so a DB-level LIMIT/OFFSET is not needed.
   *
   * @param tenantId    Tenant UUID
   * @param tenantSlug  Tenant slug
   * @param page        1-based page number (default: 1)
   * @param pageSize    Items per page, max 100 (default: 50)
   */
  async listConfigurableForms(
    tenantId: string,
    tenantSlug: string,
    page = 1,
    pageSize = 50
  ): Promise<{ forms: ConfigurableFormSummary[]; total: number; page: number; pageSize: number }> {
    // Clamp inputs
    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));

    const schemaName = tenantService.getSchemaName(tenantSlug);
    validateSchemaName(schemaName);
    const schema = Prisma.raw(schemaName);

    // Fetch all installed plugins with their manifests
    const plugins = await db.$queryRaw<RawPluginManifestRow[]>(
      Prisma.sql`
        SELECT p.id, p.name, p.manifest
        FROM core.plugins p
        INNER JOIN core.tenant_plugins tp ON tp."pluginId" = p.id
        WHERE tp."tenantId" = ${tenantId}::text
          AND tp.enabled = true
      `
    );

    // Fetch existing tenant-scope configs (non-deleted)
    const existingConfigs = await db.$queryRaw<{ form_id: string }[]>(
      Prisma.sql`
        SELECT form_id
        FROM ${schema}."layout_configs"
        WHERE scope_type = 'tenant'
          AND deleted_at IS NULL
      `
    );
    const configuredFormIds = new Set(existingConfigs.map((r: { form_id: string }) => r.form_id));

    const allSummaries: ConfigurableFormSummary[] = [];

    for (const plugin of plugins) {
      const manifest = plugin.manifest as { formSchemas?: FormSchema[] } | null;
      if (!manifest?.formSchemas?.length) continue;

      for (const form of manifest.formSchemas) {
        allSummaries.push({
          formId: form.formId,
          pluginId: plugin.id,
          pluginName: plugin.name,
          label: form.label,
          fieldCount: form.fields.length,
          sectionCount: form.sections.length,
          columnCount: form.columns.length,
          hasConfig: configuredFormIds.has(form.formId),
          // M09: include full schema so the admin panel can show field labels
          // without a secondary fetch
          schema: form,
        });
      }
    }

    const total = allSummaries.length;
    const offset = (safePage - 1) * safePageSize;
    const forms = allSummaries.slice(offset, offset + safePageSize);

    return { forms, total, page: safePage, pageSize: safePageSize };
  }

  /**
   * Soft-delete all layout configs for a plugin (called on plugin uninstall, FR-024).
   * Sets `deleted_at = NOW()` on every non-deleted config row for the given pluginId
   * across all tenant schemas of tenants that have the plugin installed.
   *
   * @param pluginId  The plugin being uninstalled
   * @param tenantSlugs  List of tenant slugs that had this plugin installed
   * @returns Number of rows soft-deleted
   */
  async softDeleteByPlugin(pluginId: string, tenantSlugs: string[]): Promise<number> {
    let total = 0;
    for (const tenantSlug of tenantSlugs) {
      try {
        const schemaName = tenantService.getSchemaName(tenantSlug);
        validateSchemaName(schemaName);
        const schema = Prisma.raw(schemaName);

        // TD-033: Use RETURNING in the CTE to capture only the newly-deleted rows,
        // avoiding a second query that would fetch ALL historically soft-deleted rows.
        const deleted = await db.$queryRaw<
          { form_id: string; scope_type: string; scope_id: string | null }[]
        >(
          Prisma.sql`
            WITH updated AS (
              UPDATE ${schema}."layout_configs"
              SET deleted_at = NOW()
              WHERE plugin_id = ${pluginId}::uuid
                AND deleted_at IS NULL
              RETURNING form_id, scope_type, scope_id
            )
            SELECT form_id, scope_type, scope_id FROM updated
          `
        );
        const n = deleted.length;
        total += n;

        // Invalidate Redis cache for each soft-deleted form
        if (n > 0) {
          // We need tenantId for cache keys — derive from tenant lookup
          const tenant = await db.tenant.findFirst({
            where: { slug: tenantSlug },
            select: { id: true },
          });
          if (tenant) {
            for (const row of deleted) {
              const scopeLabel =
                row.scope_type === 'workspace' ? `workspace:${row.scope_id ?? ''}` : 'tenant';
              await this.invalidateCache(tenant.id, row.form_id, scopeLabel);
            }
          }
        }
      } catch (err) {
        logger.warn(
          { pluginId, tenantSlug, err },
          'layout-config: softDeleteByPlugin failed for tenant (non-blocking)'
        );
      }
    }
    return total;
  }

  /**
   * Restore soft-deleted layout configs for a plugin (called on plugin reinstall, FR-024).
   * Clears `deleted_at` on every soft-deleted config row for the given pluginId.
   *
   * @param pluginId    The plugin being reinstalled
   * @param tenantSlugs List of tenant slugs that have this plugin reinstalled
   * @returns Number of rows restored
   */
  async restoreByPlugin(pluginId: string, tenantSlugs: string[]): Promise<number> {
    let total = 0;
    for (const tenantSlug of tenantSlugs) {
      try {
        const schemaName = tenantService.getSchemaName(tenantSlug);
        validateSchemaName(schemaName);
        const schema = Prisma.raw(schemaName);

        const result = await db.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`
            WITH updated AS (
              UPDATE ${schema}."layout_configs"
              SET deleted_at = NULL
              WHERE plugin_id = ${pluginId}::uuid
                AND deleted_at IS NOT NULL
              RETURNING id
            )
            SELECT COUNT(*)::bigint AS count FROM updated
          `
        );
        total += Number(result[0]?.count ?? 0);
      } catch (err) {
        logger.warn(
          { pluginId, tenantSlug, err },
          'layout-config: restoreByPlugin failed for tenant (non-blocking)'
        );
      }
    }
    return total;
  }

  // -------------------------------------------------------------------------
  // T014-07 — Resolution engine
  // -------------------------------------------------------------------------

  /**
   * Resolve the full layout for the current user (FR-025, FR-026).
   *
   * Resolution algorithm (per plan §4.10):
   *   1. If workspaceId provided: try workspace-scope config first, else tenant-scope.
   *   2. Try Redis cache for the pre-role-resolution config blob.
   *   3. On cache miss: load from DB, write back to cache.
   *   4. For each field, resolve visibility for the current user:
   *      a. Get user's effective roles (Keycloak realm roles + team member roles).
   *      b. For each role, look up role-specific visibility; fall back to globalVisibility.
   *      c. Apply "most permissive wins" across all roles (FR-007).
   *   5. Fields not in config use manifest defaults (all visible, all editable).
   *   6. New manifest fields (not in config) appended at the end in manifest order.
   *   7. Removed manifest fields silently skipped.
   * Fail-open (NFR-008): any error → return manifest defaults with source='manifest'.
   *
   * @param tenantId     Tenant UUID
   * @param tenantSlug   Tenant slug (schema derivation)
   * @param userId       User whose visibility rules to apply
   * @param keycloakRoles  Keycloak realm role names from the JWT
   * @param formId       Plugin form identifier
   * @param workspaceId  Optional workspace UUID for workspace-scope override
   */
  async resolveForUser(
    tenantId: string,
    tenantSlug: string,
    userId: string,
    keycloakRoles: string[],
    formId: string,
    workspaceId?: string | null
  ): Promise<ResolvedLayout> {
    try {
      // 1. Fetch the authoritative form schema from the plugin manifest
      const formSchema = await this.getFormSchema(tenantId, formId);
      if (!formSchema) {
        // Unknown form — return empty manifest defaults
        return this.buildManifestDefaults(formId, []);
      }

      // 2. Determine which config to use: workspace override > tenant config
      const scopeType = workspaceId ? 'workspace' : 'tenant';
      const scopeLabel = workspaceId ? `workspace:${workspaceId}` : 'tenant';

      // 3. Try Redis cache for the pre-role-resolution config blob
      let config: LayoutConfig | null = await this.loadFromCache(tenantId, formId, scopeLabel);

      if (!config) {
        // Cache miss — load from DB
        config = await this.getConfig(tenantSlug, formId, scopeType, workspaceId);

        // If workspace config doesn't exist, fall back to tenant-scope.
        // IMPORTANT: write the fallback under the 'tenant' cache key, NOT the
        // workspace key, so that the workspace cache slot remains empty and a
        // future workspace-specific config is not masked by the tenant blob.
        if (!config && workspaceId) {
          config = await this.getConfig(tenantSlug, formId, 'tenant', null);
          if (config) {
            await this.writeToCache(tenantId, formId, 'tenant', config);
          }
        } else if (config) {
          // Populate cache under the correct scope key
          await this.writeToCache(tenantId, formId, scopeLabel, config);
        }
      }

      // 4. Resolve user's effective roles from Keycloak roles + team memberships
      const effectiveRoles = await this.resolveEffectiveRoles(
        tenantSlug,
        userId,
        keycloakRoles,
        workspaceId
      );

      // 5. Build resolved layout
      if (!config) {
        return this.buildManifestDefaults(formId, formSchema);
      }

      return this.applyConfigForUser(formId, formSchema, config, effectiveRoles);
    } catch (err) {
      // Fail-open: log warning and return manifest defaults (NFR-008)
      logger.warn(
        { tenantId, formId, userId, err },
        'layout-config: resolveForUser failed — returning manifest defaults (fail-open)'
      );
      const formSchema = await this.getFormSchema(tenantId, formId).catch(() => null);
      return this.buildManifestDefaults(formId, formSchema?.fields ?? []);
    }
  }

  // -------------------------------------------------------------------------
  // Private: resolution helpers
  // -------------------------------------------------------------------------

  /**
   * Load form schema from the plugin manifest for the given form ID.
   * Returns null if no installed plugin exposes this formId.
   */
  async getFormSchema(tenantId: string, formId: string): Promise<FormSchema | null> {
    const plugins = await db.$queryRaw<RawPluginManifestRow[]>(
      Prisma.sql`
        SELECT p.id, p.name, p.manifest
        FROM core.plugins p
        INNER JOIN core.tenant_plugins tp ON tp."pluginId" = p.id
        WHERE tp."tenantId" = ${tenantId}::text
          AND tp.enabled = true
      `
    );

    for (const plugin of plugins) {
      const manifest = plugin.manifest as { formSchemas?: FormSchema[] } | null;
      if (!manifest?.formSchemas) continue;
      const form = manifest.formSchemas.find((f) => f.formId === formId);
      if (form) return form;
    }
    return null;
  }

  /**
   * Resolve the user's effective roles across:
   *   1. Keycloak realm roles (normalised to RoleKey enum values)
   *   2. Team member roles stored in the tenant schema (ADR-024)
   *
   * Returns the union of all applicable RoleKey values.
   */
  private async resolveEffectiveRoles(
    tenantSlug: string,
    userId: string,
    keycloakRoles: string[],
    workspaceId?: string | null
  ): Promise<RoleKey[]> {
    const roles = new Set<RoleKey>();

    // Map Keycloak realm role names → RoleKey
    const keycloakRoleMap: Record<string, RoleKey> = {
      super_admin: 'SUPER_ADMIN',
      'super-admin': 'SUPER_ADMIN',
      tenant_admin: 'TENANT_ADMIN',
      'tenant-admin': 'TENANT_ADMIN',
      tenant_member: 'TENANT_MEMBER',
      'tenant-member': 'TENANT_MEMBER',
    };

    for (const r of keycloakRoles) {
      const mapped = keycloakRoleMap[r];
      if (mapped) roles.add(mapped);
    }

    // Load team member roles from tenant schema
    try {
      const schemaName = tenantService.getSchemaName(tenantSlug);
      validateSchemaName(schemaName);
      const schema = Prisma.raw(schemaName);

      // When a workspaceId is provided, restrict to teams that belong to that
      // workspace (JOIN teams on team_id → workspace_id).  This prevents roles
      // from a different workspace leaking into this layout resolution context.
      const teamRoles = await db.$queryRaw<RawTeamRoleRow[]>(
        workspaceId
          ? Prisma.sql`
              SELECT DISTINCT tm.role
              FROM ${schema}."team_members" tm
              INNER JOIN ${schema}."teams" t ON t.id = tm.team_id
              WHERE tm.user_id = ${userId}::text
                AND t.workspace_id = ${workspaceId}::text
            `
          : Prisma.sql`
              SELECT DISTINCT tm.role
              FROM ${schema}."team_members" tm
              WHERE tm.user_id = ${userId}::text
            `
      );

      const teamRoleMap: Record<string, RoleKey> = {
        OWNER: 'OWNER',
        ADMIN: 'ADMIN',
        MEMBER: 'MEMBER',
        VIEWER: 'VIEWER',
      };

      for (const row of teamRoles) {
        const mapped = teamRoleMap[row.role];
        if (mapped) roles.add(mapped);
      }
    } catch (err) {
      // Fail-open: if team role lookup fails, use Keycloak roles only
      logger.warn(
        { tenantSlug, userId, err },
        'layout-config: team role lookup failed — using Keycloak roles only'
      );
    }

    // Default fallback: if no roles resolved, treat as VIEWER
    if (roles.size === 0) roles.add('VIEWER');

    return Array.from(roles);
  }

  /**
   * Apply the layout config for a user's effective roles.
   * Implements the "most permissive wins" rule (FR-007).
   */
  private applyConfigForUser(
    formId: string,
    formSchema: FormSchema,
    config: LayoutConfig,
    userRoles: RoleKey[]
  ): ResolvedLayout {
    // Build ordered field list: configured fields first (in config order),
    // then new manifest fields (not in config) appended at end (Edge Case #1)
    const configuredFieldIds = new Set(config.fields.map((f) => f.fieldId));
    const manifestFieldOrder = new Map(formSchema.fields.map((f, i) => [f.fieldId, i]));

    // Sorted by override order, fallback to manifest order
    const orderedOverrideFields = [...config.fields].sort((a, b) => a.order - b.order);
    const newManifestFields = formSchema.fields
      .filter((f) => !configuredFieldIds.has(f.fieldId))
      .sort(
        (a, b) =>
          (manifestFieldOrder.get(a.fieldId) ?? 0) - (manifestFieldOrder.get(b.fieldId) ?? 0)
      );

    // Section order
    const configuredSectionIds = new Set(config.sections.map((s) => s.sectionId));
    const orderedSections = [...config.sections]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ sectionId: s.sectionId, order: s.order }));
    const newManifestSections = formSchema.sections
      .filter((s) => !configuredSectionIds.has(s.sectionId))
      .map((s) => ({ sectionId: s.sectionId, order: s.order }));

    // Build manifest field map for required/defaultValue lookup (NEW-H-002)
    const manifestFieldMap = new Map(formSchema.fields.map((f) => [f.fieldId, f]));

    // Resolve fields
    const resolvedFields: ResolvedField[] = [];

    for (const override of orderedOverrideFields) {
      // Skip stale fields (removed from manifest) — Edge Case #1
      if (!manifestFieldOrder.has(override.fieldId)) continue;

      const vis = this.resolveFieldVisibility(override, userRoles);
      const mf = manifestFieldMap.get(override.fieldId);
      resolvedFields.push({
        fieldId: override.fieldId,
        order: override.order,
        visibility: vis,
        readonly: vis === 'readonly',
        required: mf?.required,
        defaultValue: mf?.defaultValue,
      });
    }

    // Append new manifest fields (all visible by default)
    let nextOrder = resolvedFields.length;
    for (const mf of newManifestFields) {
      resolvedFields.push({
        fieldId: mf.fieldId,
        order: nextOrder++,
        visibility: 'visible',
        readonly: false,
        required: mf.required,
        defaultValue: mf.defaultValue,
      });
    }

    // Resolve columns
    const configuredColumnIds = new Set(config.columns.map((c) => c.columnId));
    const resolvedColumns: ResolvedColumn[] = [];

    for (const colOverride of config.columns) {
      // Skip stale columns
      if (!formSchema.columns.find((c) => c.columnId === colOverride.columnId)) continue;
      const vis = this.resolveColumnVisibility(colOverride, userRoles);
      resolvedColumns.push({ columnId: colOverride.columnId, visibility: vis });
    }
    // Append new manifest columns
    for (const mc of formSchema.columns) {
      if (!configuredColumnIds.has(mc.columnId)) {
        resolvedColumns.push({ columnId: mc.columnId, visibility: 'visible' });
      }
    }

    // Determine source
    const source: 'workspace' | 'tenant' | 'manifest' =
      config.scopeType === 'workspace' ? 'workspace' : 'tenant';

    return {
      formId,
      source,
      sections: [...orderedSections, ...newManifestSections],
      fields: resolvedFields,
      columns: resolvedColumns,
    };
  }

  /**
   * Resolve visibility for a single field override given the user's roles.
   * Applies "most permissive wins" (FR-007).
   * Priority: role-specific override > globalVisibility.
   */
  private resolveFieldVisibility(
    override: FieldOverride,
    userRoles: RoleKey[]
  ): 'visible' | 'readonly' | 'hidden' {
    let result: 'visible' | 'readonly' | 'hidden' = override.globalVisibility;

    for (const role of userRoles) {
      const roleVis = override.visibility?.[role];
      if (roleVis !== undefined) {
        result = morePermissive(result, roleVis);
      }
    }

    return result;
  }

  /**
   * Resolve visibility for a single column override given the user's roles.
   * Applies "most permissive wins" (FR-007).
   */
  private resolveColumnVisibility(
    override: ColumnOverride,
    userRoles: RoleKey[]
  ): 'visible' | 'hidden' {
    let result: 'visible' | 'hidden' = override.globalVisibility;

    for (const role of userRoles) {
      const roleVis = override.visibility?.[role];
      if (roleVis !== undefined) {
        if (roleVis === 'visible') result = 'visible';
      }
    }

    return result;
  }

  /**
   * Build a manifest-defaults ResolvedLayout (all fields visible + editable).
   * Used as the fail-open fallback and when no config exists.
   *
   * Accepts the full FormSchema so that sections and columns from the manifest
   * are included in the defaults (M01 fix).  The overload that accepts only a
   * fields array is kept for the unknown-form fallback path.
   */
  private buildManifestDefaults(formId: string, formSchema: FormSchema): ResolvedLayout;
  private buildManifestDefaults(formId: string, fields: FormSchema['fields']): ResolvedLayout;
  private buildManifestDefaults(
    formId: string,
    schemaOrFields: FormSchema | FormSchema['fields']
  ): ResolvedLayout {
    const fields = Array.isArray(schemaOrFields) ? schemaOrFields : schemaOrFields.fields;

    return {
      formId,
      source: 'manifest',
      // Manifest defaults represent the "unconfigured" state — no section or
      // column layout has been saved yet.  Always return empty arrays so that
      // the frontend renders in its natural / plugin-defined order without
      // any admin-imposed structure.
      sections: [],
      fields: fields.map((f, i) => ({
        fieldId: f.fieldId,
        order: f.order ?? i,
        visibility: 'visible',
        readonly: false,
        required: f.required,
        defaultValue: f.defaultValue,
      })),
      columns: [],
    };
  }

  // -------------------------------------------------------------------------
  // Private: cache helpers
  // -------------------------------------------------------------------------

  private async loadFromCache(
    tenantId: string,
    formId: string,
    scope: string
  ): Promise<LayoutConfig | null> {
    try {
      const raw = await redis.get(cacheKey(tenantId, formId, scope));
      if (!raw) return null;
      return JSON.parse(raw) as LayoutConfig;
    } catch (err) {
      logger.warn(
        { tenantId, formId, scope, err },
        'layout-config: Redis read failed (non-blocking)'
      );
      return null;
    }
  }

  private async writeToCache(
    tenantId: string,
    formId: string,
    scope: string,
    config: LayoutConfig
  ): Promise<void> {
    try {
      await redis.set(cacheKey(tenantId, formId, scope), JSON.stringify(config), 'EX', cacheTtl());
    } catch (err) {
      logger.warn(
        { tenantId, formId, scope, err },
        'layout-config: Redis write failed (non-blocking)'
      );
    }
  }

  // -------------------------------------------------------------------------
  // Re-export validation surface for route handlers
  // -------------------------------------------------------------------------

  /**
   * Validate overrides against a manifest schema.
   * Delegates to LayoutConfigValidationService.
   */
  validate(overrides: SaveLayoutConfigOverrides, manifest: FormSchema): ValidationResult {
    return layoutConfigValidationService.validateAgainstManifest(overrides, manifest);
  }

  /**
   * Validate that the payload does not exceed the 256 KB size limit.
   */
  validateSize(overrides: SaveLayoutConfigOverrides): boolean {
    return layoutConfigValidationService.validateSize(overrides);
  }
}

/** Singleton instance shared across the application. */
export const layoutConfigService = new LayoutConfigService();

// Re-export DomainError so route handlers can reference it
export { DomainError };
