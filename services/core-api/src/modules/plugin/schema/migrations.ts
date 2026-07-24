// schema/migrations.ts
// CRITICAL #2 — Migration SQL validation via a real SQL parser.
//
// The previous allowlist of string prefixes was trivially bypassable. We now
// parse every statement with node-sql-parser and reject anything that is not
// a CREATE TABLE / CREATE INDEX / ALTER TABLE on a table matching the plugin's
// `{slug}_*` namespace, plus a hard block on `core.*` references, CTEs and
// CREATE TABLE ... AS SELECT subqueries. Migrations are additionally executed
// under SET ROLE plugin_{installId} so PostgreSQL enforces scope at runtime.

// node-sql-parser is a CommonJS module — under Node ESM (tsx/.ts files) named
// imports are not exposed, so import the default and destructure to obtain Parser.
import nodeSqlParser from 'node-sql-parser';
import { z } from 'zod';

const { Parser } = nodeSqlParser;

const parser = new Parser();
const PARSE_OPT = { database: 'postgresql' as const };

export const migrationFileSchema = z.object({
  filename: z.string().regex(/^\d+_.*\.sql$/, 'Migration filename must start with a number'),
  content: z.string().min(1, 'Migration file cannot be empty'),
});

export interface MigrationValidation {
  valid: boolean;
  errors: string[];
  statements: string[];
}

interface ParsedAst {
  type: string;
  keyword?: string;
  table?: unknown;
  as?: string | null;
  query_expr?: { with?: unknown } | null;
  with?: unknown;
  index_type?: string;
  expr?: Array<{ action?: string }>;
}

function tableNamePattern(slug: string): RegExp {
  return new RegExp(`^${slug}_[a-z0-9_]+$`);
}

function collectTableRefs(
  value: unknown,
  refs: Array<{ schema: string | null; table: string }>
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTableRefs(item, refs);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record['table'] === 'string') {
    refs.push({
      schema: typeof record['db'] === 'string' ? record['db'] : null,
      table: record['table'],
    });
  }
  for (const nested of Object.values(record)) collectTableRefs(nested, refs);
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
export function prepareMigrationSql(sql: string, slug: string): MigrationValidation {
  const errors: string[] = [];
  const expectedTable = tableNamePattern(slug);

  let parsed: { ast: ParsedAst | ParsedAst[]; tableList: string[] };
  try {
    parsed = parser.parse(sql, PARSE_OPT) as { ast: ParsedAst | ParsedAst[]; tableList: string[] };
  } catch {
    return { valid: false, errors: ['SQL parse error'], statements: [] };
  }

  const stmts: ParsedAst[] = Array.isArray(parsed.ast) ? parsed.ast : [parsed.ast];

  if (stmts.length === 0) errors.push('Migration must contain at least one statement');

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
      errors.push(
        `Disallowed statement type "${type}" — only CREATE TABLE / CREATE INDEX / ALTER TABLE allowed`
      );
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
    if (
      type === 'alter' &&
      (!ast.expr?.length || ast.expr.some(({ action }) => action !== 'add'))
    ) {
      errors.push('Only additive ALTER TABLE operations are allowed');
    }

    // Block CREATE TABLE ... AS SELECT and CTEs outright.
    if (ast.as === 'as' || ast.query_expr) {
      errors.push('CREATE TABLE ... AS SELECT is not allowed in plugin migrations');
    }
    if (ast.with || ast.query_expr?.with) {
      errors.push('WITH (CTE) clauses are not allowed in plugin migrations');
    }

    const refs: Array<{ schema: string | null; table: string }> = [];
    collectTableRefs(ast, refs);
    if (refs.length === 0) errors.push('Migration statement has no recognized table reference');
    for (const { schema, table } of refs) {
      if (schema && schema !== 'null') {
        errors.push(`Migration must not reference schema "${schema}"`);
      }
      if (!expectedTable.test(table)) {
        errors.push(`Referenced table "${table}" does not match the plugin namespace "${slug}_*"`);
      }
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    statements: valid ? stmts.map((statement) => parser.sqlify(statement as never, PARSE_OPT)) : [],
  };
}

export function validateMigrationSql(sql: string, slug: string): MigrationValidation {
  return prepareMigrationSql(sql, slug);
}
