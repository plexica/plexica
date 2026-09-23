// user-profile-email-change.test.ts
// UNIT: serialized Keycloak-first email change (006-11 round-2 #5/#6/#7).
// Normalization (#5), $transaction + SELECT FOR UPDATE serialization with a
// guarded revert (#6), and Keycloak-sourced rollback value (#7). Keycloak
// Admin client, repository, audit writer, avatar enrichment, and logger
// mocked; no live stack.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../modules/user-profile/repository.js', () => ({
  findProfileByKeycloakId: vi.fn(),
  upsertProfile: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('../../lib/keycloak-admin-users.js', () => ({
  syncDisplayName: vi.fn(),
  syncEmail: vi.fn(),
  getRealmUserEmail: vi.fn(),
}));
vi.mock('../../modules/audit-log/writer.js', () => ({
  writeAuditLog: vi.fn(),
}));
vi.mock('../../modules/user-profile/avatar.js', () => ({
  enrichProfile: vi.fn(async (profile: unknown) => profile),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { updateProfile } from '../../modules/user-profile/service.js';
import { normalizeEmail } from '../../modules/user-profile/email-change.js';
import {
  findProfileByKeycloakId,
  updateProfile as repoUpdate,
} from '../../modules/user-profile/repository.js';
import { syncEmail, getRealmUserEmail } from '../../lib/keycloak-admin-users.js';
import { logger } from '../../lib/logger.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { TenantPrisma, TenantPrismaClient } from '../../lib/tenant-database.js';
import type { UserProfileDto } from '../../modules/user-profile/types.js';

const CTX: TenantContext = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  slug: 'unit-test',
  schemaName: 'tenant_unit_test',
  realmName: 'plexica-unit-test',
};
const KC_USER_ID = '11111111-2222-4333-8444-555555555555';
const OLD_EMAIL = 'old@test.io';
const NEW_EMAIL = 'new@test.io';

const findMock = vi.mocked(findProfileByKeycloakId);
const repoUpdateMock = vi.mocked(repoUpdate);
const syncEmailMock = vi.mocked(syncEmail);
const kcEmailMock = vi.mocked(getRealmUserEmail);

function existingProfile(email = OLD_EMAIL): UserProfileDto {
  return {
    userId: 'c0ffee00-0000-4000-8000-000000000001',
    keycloakUserId: KC_USER_ID,
    email,
    displayName: 'Test User',
    avatarPath: null,
    timezone: 'UTC',
    language: 'en',
    notificationPrefs: {},
    avatarUrl: null,
    avatarSource: 'upload',
    keycloakAccountUrl: 'http://keycloak.test/realms/plexica-unit-test/account',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

const txQueryRawMock = vi.fn(async (query: unknown) => {
  lastRawQuery = query;
  if (lockedEmailQueue.length > 0) return [{ email: lockedEmailQueue.shift() as string }];
  return [{ email: lockedEmailValue }];
});
const txClient = { $queryRaw: txQueryRawMock } as unknown as TenantPrisma.TransactionClient;
const transactionMock = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txClient));
const db = { $transaction: transactionMock } as unknown as TenantPrismaClient;

let lastCall: { db: unknown; fields: Record<string, unknown> } | undefined;
let lockedEmailValue = OLD_EMAIL;
let lockedEmailQueue: string[] = [];
let lastRawQuery: unknown;

beforeEach(() => {
  vi.clearAllMocks();
  lastCall = undefined;
  lockedEmailValue = OLD_EMAIL;
  lockedEmailQueue = [];
  lastRawQuery = undefined;
  findMock.mockResolvedValue(existingProfile());
  kcEmailMock.mockResolvedValue(OLD_EMAIL);
  repoUpdateMock.mockImplementation(async (dbArg, _userId, fields) => {
    lastCall = { db: dbArg, fields: fields as unknown as Record<string, unknown> };
    return {
      ...existingProfile(),
      ...(typeof fields.email === 'string' ? { email: fields.email } : {}),
    };
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Old@Test.IO ')).toBe('old@test.io');
  });
});

describe('email change normalization (#5)', () => {
  it('a case-only edit never touches Keycloak and writes no email', async () => {
    findMock.mockResolvedValue(existingProfile('Old@Test.IO'));

    await updateProfile(db, KC_USER_ID, { email: '  old@test.io ', timezone: 'Europe/Rome' }, CTX);

    expect(syncEmailMock).not.toHaveBeenCalled();
    expect(kcEmailMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(repoUpdateMock).toHaveBeenCalledOnce();
    expect(lastCall?.db).toBe(db);
    expect(lastCall?.fields).toMatchObject({ timezone: 'Europe/Rome' });
    expect(lastCall !== undefined && 'email' in lastCall.fields).toBe(false);
  });

  it('persists the normalized address to both stores', async () => {
    await updateProfile(db, KC_USER_ID, { email: 'New@Test.IO' }, CTX);

    expect(syncEmailMock).toHaveBeenCalledOnce();
    expect(syncEmailMock).toHaveBeenCalledWith(CTX.realmName, KC_USER_ID, NEW_EMAIL);
    expect(lastCall?.fields.email).toBe(NEW_EMAIL);
  });
});

describe('email change serialization (#6)', () => {
  it('runs the email path inside $transaction with SELECT ... FOR UPDATE', async () => {
    await updateProfile(db, KC_USER_ID, { email: NEW_EMAIL }, CTX);

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(txQueryRawMock).toHaveBeenCalledOnce();
    expect(JSON.stringify(lastRawQuery)).toContain('FOR UPDATE');
  });

  it('skips the Keycloak sync when the locked row already holds the address', async () => {
    lockedEmailValue = NEW_EMAIL;

    await updateProfile(db, KC_USER_ID, { email: NEW_EMAIL }, CTX);

    expect(syncEmailMock).not.toHaveBeenCalled();
    expect(lastCall?.fields.email).toBe(NEW_EMAIL);
  });

  it('skips the revert when a concurrent change won after our sync', async () => {
    repoUpdateMock.mockRejectedValue(new Error('db down'));
    lockedEmailQueue = [OLD_EMAIL, 'winner@test.io'];

    await expect(updateProfile(db, KC_USER_ID, { email: NEW_EMAIL }, CTX)).rejects.toThrow(
      'db down'
    );
    expect(syncEmailMock).toHaveBeenCalledOnce();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce();
  });
});

describe('Keycloak-sourced rollback value (#7)', () => {
  it('reverts to Keycloak previous address, never the local placeholder', async () => {
    findMock.mockResolvedValue(existingProfile(''));
    kcEmailMock.mockResolvedValue('real@test.io');
    lockedEmailValue = '';
    repoUpdateMock.mockRejectedValue(new Error('db down'));

    await expect(updateProfile(db, KC_USER_ID, { email: NEW_EMAIL }, CTX)).rejects.toThrow(
      'db down'
    );

    expect(syncEmailMock).toHaveBeenCalledTimes(2);
    expect(syncEmailMock).toHaveBeenNthCalledWith(1, CTX.realmName, KC_USER_ID, NEW_EMAIL);
    expect(syncEmailMock).toHaveBeenNthCalledWith(2, CTX.realmName, KC_USER_ID, 'real@test.io');
    for (const call of syncEmailMock.mock.calls) {
      expect(call[2]).not.toBe('');
    }
  });

  it('a pre-read failure aborts before any mutation', async () => {
    kcEmailMock.mockRejectedValue(new Error('kc down'));

    await expect(updateProfile(db, KC_USER_ID, { email: NEW_EMAIL }, CTX)).rejects.toThrow(
      'kc down'
    );
    expect(syncEmailMock).not.toHaveBeenCalled();
    expect(repoUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
