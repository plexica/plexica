// unit/notification/service-preferences.test.ts
// Unit tests for the preferences patch path (fix 14): updatePreferences runs
// the read-merge-write inside a tenant-schema transaction with SELECT ... FOR
// UPDATE on the profile row, so concurrent partial PATCHes cannot clobber each
// other. Pure unit tests — transaction client mocked.

import { describe, expect, it, vi } from 'vitest';

import { updatePreferences } from '../../../modules/notification/service.js';

import type { TenantPrismaClient } from '../../../lib/tenant-database.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function txMock(initialPrefs: unknown): {
  tx: {
    $queryRaw: ReturnType<typeof vi.fn>;
    userProfile: { update: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  };
  db: TenantPrismaClient;
} {
  const tx = {
    $queryRaw: vi.fn(async () => [{ notificationPrefs: initialPrefs }]),
    userProfile: {
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const db = {
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  } as unknown as TenantPrismaClient;
  return { tx, db };
}

describe('updatePreferences — atomic read-merge-write (fix 14)', () => {
  it('runs the whole merge inside one transaction', async () => {
    const { db } = txMock({
      defaults: { inApp: true, email: false },
      types: { 'plugin.a.b': { inApp: true, email: false } },
    });
    await updatePreferences(db, USER_ID, {
      types: { 'plugin.c.d': { inApp: false, email: true } },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('locks the profile row with SELECT ... FOR UPDATE before reading', async () => {
    const { db, tx } = txMock(null);
    await updatePreferences(db, USER_ID, {});
    const [query] = tx.$queryRaw.mock.calls[0] ?? [];
    const text = (query as unknown as { text: string }).text;
    expect(text).toContain('FROM user_profile');
    expect(text).toContain('FOR UPDATE');
  });

  it('merges the patch over the current prefs without clobbering untouched keys', async () => {
    const { db, tx } = txMock({
      defaults: { inApp: true, email: true },
      types: { 'plugin.a.b': { inApp: true, email: false } },
    });
    const result = await updatePreferences(db, USER_ID, {
      types: { 'plugin.c.d': { inApp: false, email: true } },
    });

    expect(result.defaults).toEqual({ inApp: true, email: true });
    expect(result.types['plugin.a.b']).toEqual({ inApp: true, email: false });
    expect(result.types['plugin.c.d']).toEqual({ inApp: false, email: true });
    const updateArgs = tx.userProfile.update.mock.calls[0]?.[0] as {
      data: { notificationPrefs: unknown };
    };
    expect(updateArgs.data.notificationPrefs).toEqual(result);
  });
});
