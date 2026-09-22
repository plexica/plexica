// unit/translation-service.test.ts
// Audit contract for translation overrides (006-10, session-006 review
// Major 2): `audit_log.target_id` is a UUID column, so a translation KEY must
// never be written to it (the INSERT would error + be swallowed, dropping the
// trail). The override identity + payload ride in the before/after JSON facets
// instead, mirroring the workspace-member audit entries.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
  upsertTranslationOverride: vi.fn(),
  deleteTranslationOverride: vi.fn(),
}));

vi.mock('../../modules/audit-log/writer.js', () => ({
  writeAuditLog: mocks.writeAuditLog,
}));
vi.mock('../../modules/tenant-settings/translation-repository.js', () => ({
  findAllTranslationOverrides: vi.fn(),
  upsertTranslationOverride: mocks.upsertTranslationOverride,
  deleteTranslationOverride: mocks.deleteTranslationOverride,
}));

import { upsertTranslation } from '../../modules/tenant-settings/translation-service.js';

const db = {} as never;
const ACTOR = '00000000-0000-4000-8000-0000000000aa';

describe('upsertTranslation audit entries', () => {
  beforeEach(() => {
    mocks.writeAuditLog.mockReset();
    mocks.upsertTranslationOverride.mockReset();
    mocks.deleteTranslationOverride.mockReset();
  });

  it('upsert path: NO targetId (uuid column) — key/locale/value in afterValue', async () => {
    mocks.upsertTranslationOverride.mockResolvedValue({
      key: 'common.save',
      locale: 'it',
      value: 'Salva',
      updated_at: new Date('2026-04-01T00:00:00Z'),
    });
    await upsertTranslation(db, ACTOR, { key: 'common.save', locale: 'it', value: 'Salva' });

    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1);
    const entry = mocks.writeAuditLog.mock.calls[0]?.[1];
    expect(entry.targetType).toBe('translation');
    expect(entry.targetId).toBeUndefined(); // never fed a non-UUID into target_id
    expect(entry.afterValue).toEqual({ key: 'common.save', locale: 'it', value: 'Salva' });
  });

  it('revert path: deleted payload in beforeValue, empty value in afterValue', async () => {
    mocks.deleteTranslationOverride.mockResolvedValue({
      key: 'common.save',
      locale: 'en',
      value: 'Save',
      updated_at: new Date('2026-04-01T00:00:00Z'),
    });
    await upsertTranslation(db, ACTOR, { key: 'common.save', locale: 'en', value: '' });

    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1);
    const entry = mocks.writeAuditLog.mock.calls[0]?.[1];
    expect(entry.targetId).toBeUndefined();
    expect(entry.beforeValue).toEqual({ key: 'common.save', locale: 'en', value: 'Save' });
    expect(entry.afterValue).toEqual({ key: 'common.save', locale: 'en', value: '' });
  });
});
