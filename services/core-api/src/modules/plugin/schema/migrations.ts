// schema/migrations.ts
// CRITICAL #2 — Migration SQL validation via a real SQL parser.
//
// The previous allowlist of string prefixes was trivially bypassable. We now
// parse every statement with node-sql-parser and reject anything that is not
// a CREATE TABLE / CREATE INDEX / ALTER TABLE on a table matching the plugin's
// `{slug}_*` namespace, plus a hard block on `core.*` references, CTEs and
// CREATE TABLE ... AS SELECT subqueries. Migrations are additionally executed
// under SET ROLE plugin_{installId} so PostgreSQL enforces scope at runtime.

import { Parser } from 'node-sql-parser';
import { z } from 'zod';

const parser = new Parser();
const PARSE_OPT = { database: 'postgresql' as const };

export const migrationFileSchema = z.object({
  filename: z.string().regex(/^\d+_.*\.sql$/, 'Migration filename must start with a number'),
  content: z.string().min(1, 'Migration file cannot be empty'),
});

export interface MigrationValidation {
  valid: boolean;
  errors: string[];
}

interface ParsedAst {
  type: string;
  keyword?: string;
  table?: unknown;
  as?: string | null;
  query_expr?: { with?: unknown } | null;
  with?: unknown;
  index_type?: string;
}

function tableNamePattern(slug: string): RegExp {
  return new RegExp(`^${slug}_[a-z0-9_]+$`);
}

function extractTableRef(ast: ParsedAst): { schema: string | null; table: string | null } {
  // CREATE TABLE / ALTER TABLE → a.table is an array of { db, table }
  const tableField = ast.table;
  if (Array.isArray(tableField)) {
    const first = tableField[0] as { db?: string | null; table?: string | null } | undefined;
    return { schema: first?.db ?? null, table: first?.table ?? null };
  }
  if (tableField && typeof tableField === 'object') {
    const t = tableField as { db?: string | null; table?: string | null };
    return { schema: t.db ?? null, table: t.table ?? null };
  }
  return { schema: null, table: null };
}

/**
 * Validates plugin migration SQL using a real SQL parser.
 *
 * Rejected unconditionally:
 *   - any statement that is not CREATE TABLE / CREATE INDEX / ALTER TABLE
 *   - references to tables not matching `{slug}_*`
 *   - references to the `core` schema (e.g. core.tenants)
 *   - CREATE TABLE ... AS SELECT subqueries
 *   - WITH (CTE) clauses
 *
 * @param sql   Raw migration SQL (may contain multiple statements).
 * @param slug  Plugin slug — all referenced tables must be in its namespace.
 */
export function validateMigrationSql(sql: string, slug: string): MigrationValidation {
  const errors: string[] = [];
  const expectedTable = tableNamePattern(slug);

  let parsed: { ast: ParsedAst | ParsedAst[]; tableList: string[] };
  try {
    parsed = parser.parse(sql, PARSE_OPT) as { ast: ParsedAst | ParsedAst[]; tableList: string[] };
  } catch (err: any) {
    return { valid: false, errors: [`SQL parse error: ${err?.message ?? err}`] };
  }

  const stmts: ParsedAst[] = Array.isArray(parsed.ast) ? parsed.ast : [parsed.ast];

  // tableList entries have the shape "action::schema::table" — scan for any
  // cross-schema or subquery reference the per-statement check might miss.
  for (const entry of parsed.tableList ?? []) {
    const [, schema, table] = entry.split('::');
    if (schema && schema !== 'null' && schema === 'core') {
      errors.push(`Migration must not reference the "core" schema (found: ${entry})`);
    }
    if (entry.startsWith('select::') && table !== 'DUAL') {
      errors.push(`Migration must not contain SELECT subqueries (found: ${entry})`);
    }
  }

  for (const ast of stmts) {
    const type = ast.type;
    const keyword = (ast.keyword ?? '').toLowerCase();

    if (type !== 'create' && type !== 'alter') {
      errors.push(`Disallowed statement type "${type}" — only CREATE TABLE / CREATE INDEX / ALTER TABLE allowed`);
      continue;
    }
    if (type === 'create' && keyword !== 'table' && keyword !== 'index') {
      errors.push(`Disallowed CREATE "${keyword}" — only TABLE and INDEX allowed`);
      continue;
    }
    if (type === 'alter' && keyword !== 'table') {
      errors.push(`Disallowed ALTER "${keyword}" — only ALTER TABLE allowed`);
      continue;
    }

    // Block CREATE TABLE ... AS SELECT and CTEs outright.
    if (ast.as === 'as' || ast.query_expr) {
      errors.push('CREATE TABLE ... AS SELECT is not allowed in plugin migrations');
    }
    if (ast.with || ast.query_expr?.with) {
      errors.push('WITH (CTE) clauses are not allowed in plugin migrations');
    }

    const { schema, table } = extractTableRef(ast);
    if (schema && schema !== 'null' && schema === 'core') {
      errors.push(`Migration must not reference the "core" schema (table: ${schema}.${table ?? '?'})`);
    }
    if (schema && schema !== 'null') {
      errors.push(`Migration must not reference schema "${schema}" — only the tenant schema is permitted`);
    }
    if (!table || !expectedTable.test(table)) {
      errors.push(
        `Referenced table "${table ?? '?'}" does not match the plugin namespace "${slug}_*"`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
