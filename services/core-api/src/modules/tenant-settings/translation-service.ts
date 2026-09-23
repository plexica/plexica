// translation-service.ts
// Business logic for tenant translation overrides (006-10).
//
// GET is readable by any authenticated tenant user; PUT is restricted to
// tenant admins by the settings-module ABAC guard at the route layer. An empty
// `value` DELETES the row (revert to default — plan §5.5).

import { writeAuditLog } from '../audit-log/writer.js';

import {
  deleteTranslationOverride,
  findAllTranslationOverrides,
  upsertTranslationOverride,
} from './translation-repository.js';

import type { TenantPrismaClient } from '../../lib/tenant-database.js';
import type {
  TranslationOverrideDto,
  TranslationOverrideListDto,
  UpsertTranslationInput,
} from './types.js';

/** Grouped shape the GET route returns (plan §5.5). */
export async function getTranslationOverrides(
  db: TenantPrismaClient
): Promise<TranslationOverrideListDto> {
  const rows = await findAllTranslationOverrides(db);
  const grouped: TranslationOverrideListDto['overrides'] = {};
  for (const row of rows) {
    const locale = row.locale as 'en' | 'it';
    const entry = grouped[row.key] ?? {};
    entry[locale] = row.value;
    grouped[row.key] = entry;
  }
  return { overrides: grouped };
}

/**
 * Upsert or revert one override. `input.value === ''` → DELETE the row and
 * return a revert-style DTO (`value: ''`) so the response stays on the same
 * `{ key, locale, value, updatedAt }` contract (plan §5.5).
 */
export async function upsertTranslation(
  db: TenantPrismaClient,
  actorId: string,
  input: UpsertTranslationInput
): Promise<TranslationOverrideDto> {
  if (input.value === '') {
    const deleted = await deleteTranslationOverride(db, {
      key: input.key,
      locale: input.locale,
    });
    // `target_id` is a UUID column — a translation key must NOT be written to
    // it (the INSERT would fail and be swallowed by the writer, losing the
    // audit trail). The key/locale/value ride in the before/after JSON facets,
    // mirroring how workspace-member audit entries carry their role facets.
    await writeAuditLog(db, {
      actorId,
      actionType: 'settings.translation_override',
      targetType: 'translation',
      beforeValue: {
        key: input.key,
        locale: input.locale,
        value: deleted?.value ?? '',
      },
      afterValue: { key: input.key, locale: input.locale, value: '' },
    });
    return {
      key: input.key,
      locale: input.locale,
      value: '',
      updatedAt: deleted?.updated_at.toISOString() ?? new Date().toISOString(),
    };
  }

  const row = await upsertTranslationOverride(db, {
    key: input.key,
    locale: input.locale,
    value: input.value,
    updatedBy: actorId,
  });

  await writeAuditLog(db, {
    actorId,
    actionType: 'settings.translation_override',
    targetType: 'translation',
    // Same contract as the revert path: no non-UUID target_id, the override
    // identity + payload live in the JSON facets.
    afterValue: { key: row.key, locale: row.locale, value: row.value },
  });

  return {
    key: row.key,
    locale: row.locale as 'en' | 'it',
    value: row.value,
    updatedAt: row.updated_at.toISOString(),
  };
}
