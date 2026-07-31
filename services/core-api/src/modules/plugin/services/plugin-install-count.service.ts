// services/plugin-install-count.service.ts
// Counts active plugin installations across all tenant schemas.
//
// plugin_installations lives in each tenant schema (ADR-001 schema-per-tenant),
// so a platform-wide count requires querying every tenant schema. Schema names
// are derived from core.tenants.slug via toSchemaName() and re-validated against
// a strict regex before interpolation — they are never user input (Security §3).
//
// "Active" = status <> 'uninstalled'. Uninstalled plugins are terminal and must
// NOT count toward the deprecated-vs-unpublished decision (ADR-022 Decision 5).

import { toSchemaName } from '../../../lib/tenant-schema-helpers.js';

import type { PrismaClient } from '@prisma/client';


// toSchemaName() produces `tenant_<slug-with-underscores>`. Re-validate as
// defence-in-depth (slug comes from DB, not user input).
const SCHEMA_NAME_REGEX = /^tenant_[a-z0-9_]+$/;

/**
 * Filters schema names to only those that contain the specified table.
 * This is a defence-in-depth guard: even if a tenant schema exists without
 * the expected table (e.g. incomplete provisioning or test artefacts),
 * cross-schema queries won't fail with "relation does not exist".
 *
 * The query uses a single information_schema scan for all candidate schemas
 * rather than checking each schema individually, keeping the overhead O(1)
 * in the number of schemas.
 */
async function filterSchemasWithTable(
  prisma: PrismaClient,
  schemas: string[],
  tableName: string
): Promise<string[]> {
  if (schemas.length === 0) return [];
  // Build a parameterised list of schema names to check in one query.
  const placeholders = schemas.map((_, i) => `$${i + 1}`);
  const sql = `
    SELECT table_schema
    FROM information_schema.tables
    WHERE table_schema IN (${placeholders.join(', ')})
      AND table_name = $${schemas.length + 1}
      AND table_type = 'BASE TABLE'
  `;
  const rows = await prisma.$queryRawUnsafe<Array<{ table_schema: string }>>(
    sql,
    ...schemas,
    tableName
  );
  const validSet = new Set(rows.map((r) => r.table_schema));
  return schemas.filter((s) => validSet.has(s));
}

interface CountRow {
  plugin_id: string;
  count: number;
}

/**
 * Returns a map of pluginId → active installation count across all non-deleted
 * tenant schemas. Plugins with zero installs are absent from the map (callers
 * should default to 0).
 */
export async function countPluginInstallationsBatch(
  prisma: PrismaClient,
  pluginIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (pluginIds.length === 0) return result;

  const tenants = await prisma.tenant.findMany({
    where: { status: { not: 'deleted' } },
    select: { slug: true },
  });

  const schemaNames = tenants
    .map((t) => toSchemaName(t.slug))
    .filter((s) => SCHEMA_NAME_REGEX.test(s));

  if (schemaNames.length === 0) return result;

  // Filter schemas to only those that actually have the plugin_installations
  // table. This prevents failures when a tenant schema was created without
  // running tenant DDL migrations — e.g. in test ensureTenant() helpers,
  // or during recovery scenarios where the table may be absent.
  const validSchemas = await filterSchemasWithTable(prisma, schemaNames, 'plugin_installations');
  if (validSchemas.length === 0) return result;

  // Parameterised IN list: $1..$N for pluginIds, cast to ::uuid so Postgres
  // resolves the operator (plugin_id is uuid; bound params arrive as text and
  // `uuid = text` raises 42883 "operator does not exist" without the cast).
  // Schema names are regex-validated and non-user-controlled; plugin_id values
  // are bound parameters.
  const inList = pluginIds.map((_, i) => `$${i + 1}::uuid`).join(', ');
  const unions = validSchemas
    .map(
      (s) =>
        `SELECT plugin_id, COUNT(*)::int AS count ` +
        `FROM "${s}".plugin_installations ` +
        `WHERE plugin_id IN (${inList}) AND status <> 'uninstalled' ` +
        `GROUP BY plugin_id`
    )
    .join(' UNION ALL ');

  const rows = await prisma.$queryRawUnsafe<CountRow[]>(unions, ...pluginIds);

  for (const row of rows) {
    const prev = result.get(row.plugin_id) ?? 0;
    result.set(row.plugin_id, prev + (row.count ?? 0));
  }
  return result;
}

/**
 * Convenience wrapper: active installation count for a single plugin.
 */
export async function countPluginInstallations(
  prisma: PrismaClient,
  pluginId: string
): Promise<number> {
  const map = await countPluginInstallationsBatch(prisma, [pluginId]);
  return map.get(pluginId) ?? 0;
}
