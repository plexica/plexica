// schema/migrations.ts
// Zod schema for validating plugin migration SQL files.

import { z } from 'zod';

// Allow-listed SQL statement types for plugin migrations.
// Plugin migrations must not contain DROP, GRANT, or other dangerous statements.
const ALLOWED_PREFIXES = [
  'CREATE TABLE',
  'ALTER TABLE ADD',
  'CREATE INDEX',
  'CREATE UNIQUE INDEX',
  'COMMENT ON',
] as const;

const ALLOWED_SINGLE_LINE = ['BEGIN', 'COMMIT', 'ROLLBACK'] as const;

const FORBIDDEN_KEYWORDS = [
  'DROP ',
  'TRUNCATE ',
  'GRANT ',
  'REVOKE ',
  'ALTER COLUMN',
  'DROP COLUMN',
  'DELETE FROM',
  'INSERT INTO',
] as const;

export const migrationFileSchema = z.object({
  filename: z.string().regex(/^\d+_.*\.sql$/, 'Migration filename must start with a number'),
  content: z.string().min(1, 'Migration file cannot be empty'),
});

export function validateMigrationSql(sql: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Split on semicolons to validate each statement independently
  // This prevents bypass via inline multi-statement SQL
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    const upper = stmt.trim().toUpperCase();

    // Check for forbidden keywords first (these are NEVER allowed)
    const hasForbidden = FORBIDDEN_KEYWORDS.some((kw) => upper.includes(kw));
    if (hasForbidden) {
      errors.push(`Disallowed SQL operation in: "${stmt.substring(0, 80)}..."`);
      continue;
    }

    // Check if it's an allowed single-line control statement
    const isControl = ALLOWED_SINGLE_LINE.some((ctrl) => upper === ctrl);
    if (isControl) continue;

    // Check if it starts with an allowed prefix
    const isAllowed = ALLOWED_PREFIXES.some((prefix) => upper.startsWith(prefix));
    if (!isAllowed) {
      errors.push(`Unrecognized or disallowed statement: "${stmt.substring(0, 80)}..."`);
    }
  }

  return { valid: errors.length === 0, errors };
}
