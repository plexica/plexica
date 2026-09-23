// translation-repository.ts
// Data access for the tenant `translation_overrides` table (006-10).
//
// The table lives in the tenant schema and is created by the raw-SQL tenant
// migration `006_translation_overrides` (task 1.3) — it is NOT a Prisma model,
// so every access goes through parameterised `$queryRaw`/`$executeRaw`
// (Security §3 — never string-interpolated SQL). All statements use the
// `Prisma.sql` tagged template so values are bound, never concatenated.

import { Prisma } from '../../../prisma/generated/tenant-client/index.js';

import type { TenantDbClient } from '../../lib/tenant-database.js';
import type { TranslationOverrideDto } from './types.js';

interface TranslationOverrideRow {
  key: string;
  locale: string;
  value: string;
  updated_at: Date;
}

function rowToDto(row: TranslationOverrideRow): TranslationOverrideDto {
  return {
    key: row.key,
    locale: row.locale as 'en' | 'it',
    value: row.value,
    updatedAt: row.updated_at.toISOString(),
  };
}

const SELECT_COLUMNS = Prisma.sql`SELECT key, locale, value, updated_at FROM translation_overrides`;

/**
 * Returns every override grouped by key:
 * `{ "common.save": { "en": "Save", "it": "Salva" } }` → the client-facing
 * shape is assembled by the service (plan §5.5).
 */
export async function findAllTranslationOverrides(
  db: TenantDbClient
): Promise<TranslationOverrideRow[]> {
  return db.$queryRaw<TranslationOverrideRow[]>(SELECT_COLUMNS);
}

/**
 * Upserts one override (INSERT … ON CONFLICT (key, locale) DO UPDATE).
 * An empty `value` is NOT inserted here — the service deletes the row instead
 * (revert to default).
 */
export async function upsertTranslationOverride(
  db: TenantDbClient,
  input: { key: string; locale: string; value: string; updatedBy: string | null }
): Promise<TranslationOverrideRow> {
  const rows = await db.$queryRaw<TranslationOverrideRow[]>(Prisma.sql`
    INSERT INTO translation_overrides (key, locale, value, updated_by)
    VALUES (${input.key}, ${input.locale}, ${input.value}, ${input.updatedBy}::uuid)
    ON CONFLICT (key, locale) DO UPDATE SET
      value = EXCLUDED.value,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING key, locale, value, updated_at
  `);
  const row = rows[0] as TranslationOverrideRow | undefined;
  if (row === undefined) throw new Error('Upsert did not return a translation override row');
  return row;
}

/**
 * Deletes one override (revert to default). Returns the deleted row (for the
 * response `updatedAt`) or null when no row existed.
 */
export async function deleteTranslationOverride(
  db: TenantDbClient,
  input: { key: string; locale: string }
): Promise<TranslationOverrideRow | null> {
  const rows = await db.$queryRaw<TranslationOverrideRow[]>(Prisma.sql`
    DELETE FROM translation_overrides
    WHERE key = ${input.key} AND locale = ${input.locale}
    RETURNING key, locale, value, updated_at
  `);
  return rows[0] ?? null;
}

export { rowToDto };
