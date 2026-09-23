// user-profile-update.test.ts
// UNIT: profile update — ''-as-no-change schema tolerance (006-11) and the
// Keycloak-first compensating revert (service.ts). Keycloak Admin client,
// repository, audit writer, avatar enrichment, and logger mocked; no live stack.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../modules/user-profile/repository.js', () => ({
  findProfileByKeycloakId: vi.fn(),
  upsertProfile: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('../../lib/keycloak-admin-users.js', () => ({
  syncDisplayName: vi.fn(),
  syncEmail: vi.fn(),
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
import { updateProfileSchema } from '../../modules/user-profile/schema.js';
import {
  findProfileByKeycloakId,
  updateProfile as repoUpdate,
} from '../../modules/user-profile/repository.js';
import { syncEmail } from '../../lib/keycloak-admin-users.js';
import { writeAuditLog } from '../../modules/audit-log/writer.js';
import { logger } from '../../lib/logger.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { TenantPrismaClient } from '../../lib/tenant-database.js';
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
const auditMock = vi.mocked(writeAuditLog);

function existingProfile(): UserProfileDto {
  return {
    userId: 'c0ffee00-0000-4000-8000-000000000001',
    keycloakUserId: KC_USER_ID,
    email: OLD_EMAIL,
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

const db = {} as unknown as TenantPrismaClient;

beforeEach(() => {
  vi.clearAllMocks();
  findMock.mockResolvedValue(existingProfile());
});

describe("updateProfileSchema ''-as-no-change (006-11)", () => {
  it('normalizes an untouched empty email to undefined (never triggers syncEmail)', () => {
    const parsed = updateProfileSchema.parse({ email: '', timezone: 'UTC' });

    expect(parsed.email).toBeUndefined();
    expect(parsed.timezone).toBe('UTC');
  });

  it('normalizes an untouched empty displayName to undefined', () => {
    expect(updateProfileSchema.parse({ displayName: '' }).displayName).toBeUndefined();
  });

  it('still rejects a malformed non-empty email', () => {
    expect(() => updateProfileSchema.parse({ email: 'not-an-email' })).toThrow();
  });

  it('passes a real email and profile-only fields through', () => {
    const parsed = updateProfileSchema.parse({ email: NEW_EMAIL, language: 'it' });

    expect(parsed.email).toBe(NEW_EMAIL);
    expect(parsed.language).toBe('it');
  });
});

describe('updateProfile compensating Keycloak revert (006-11)', () => {
  it('reverts Keycloak to the old email when the local write fails, then rethrows', async () => {
    const localFailure = new Error('db connection dropped');
    repoUpdateMock.mockRejectedValue(localFailure);
    syncEmailMock.mockResolvedValue(undefined);

    const err = await updateProfile(db, KC_USER_ID, { email: NEW_EMAIL }, CTX).catch(
      (e: unknown) => e
    );

    expect(err).toBe(localFailure);
    expect(syncEmailMock).toHaveBeenCalledTimes(2);
    expect(syncEmailMock).toHaveBeenNthCalledWith(1, CTX.realmName, KC_USER_ID, NEW_EMAIL);
    expect(syncEmailMock).toHaveBeenNthCalledWith(2, CTX.realmName, KC_USER_ID, OLD_EMAIL);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('a failed rollback is logged but never replaces the original error', async () => {
    const localFailure = new Error('constraint violation');
    repoUpdateMock.mockRejectedValue(localFailure);
    syncEmailMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('kc down'));

    const err = await updateProfile(db, KC_USER_ID, { email: NEW_EMAIL }, CTX).catch(
      (e: unknown) => e
    );

    expect(err).toBe(localFailure);
    expect(vi.mocked(logger.error)).toHaveBeenCalledOnce();
  });

  it('syncs Keycloak exactly once and audits on the success path', async () => {
    const row = { ...existingProfile(), email: NEW_EMAIL };
    repoUpdateMock.mockResolvedValue(row);
    syncEmailMock.mockResolvedValue(undefined);

    await expect(updateProfile(db, KC_USER_ID, { email: NEW_EMAIL }, CTX)).resolves.toBe(row);
    expect(syncEmailMock).toHaveBeenCalledTimes(1);
    expect(repoUpdateMock).toHaveBeenCalledWith(
      db,
      row.userId,
      expect.objectContaining({ email: NEW_EMAIL })
    );
    expect(auditMock).toHaveBeenCalledOnce();
  });

  it('never touches Keycloak when the local write fails without an email change', async () => {
    repoUpdateMock.mockRejectedValue(new Error('db down'));

    await expect(updateProfile(db, KC_USER_ID, { timezone: 'Europe/Rome' }, CTX)).rejects.toThrow(
      'db down'
    );
    expect(syncEmailMock).not.toHaveBeenCalled();
  });
});
