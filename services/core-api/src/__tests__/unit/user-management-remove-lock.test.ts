// user-management-remove-lock.test.ts
// Unit tests for the TOCTOU fix wiring in removeUser: WHEN the per-tenant
// advisory lock (lockTenantAdminRemoval) is taken, on WHICH client, and in
// WHICH ORDER relative to the authoritative last-admin re-check and the
// mutations. The Keycloak admin set is stubbed, so these run without a live
// Keycloak — the end-to-end race outcome ([204, 409]) is covered by
// user-management-remove-race.test.ts, which requires one.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Two DISTINGUISHABLE fake clients, hoisted for the vi.mock factories (same
// pattern as user-management-remove.test.ts): the lock must be assertable as
// taken on the transaction client, never the outer one.
const { TX_CLIENT, OUTER_CLIENT } = vi.hoisted(() => {
  const tx = { __client: 'tx' };
  return {
    TX_CLIENT: tx,
    OUTER_CLIENT: {
      __client: 'outer',
      $transaction: async (cb: (t: unknown) => Promise<unknown>): Promise<unknown> => cb(tx),
    },
  };
});

vi.mock('../../lib/keycloak-admin-users.js', () => ({
  disableRealmUser: vi.fn().mockResolvedValue(undefined),
  terminateUserSessions: vi.fn().mockResolvedValue(undefined),
}));

// Admin guard mocked (unit-tested in user-management-admin-guard.test.ts) —
// each test stubs the fetched admin set explicitly; default is fail-open null.
vi.mock('../../modules/user-management/admin-guard.js', () => ({
  fetchTenantAdminKeycloakIds: vi.fn().mockResolvedValue(null),
  assertNotLastTenantAdmin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../modules/audit-log/writer.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/tenant-database.js', () => ({
  withTenantDb: vi.fn(async (fn: (db: unknown) => Promise<unknown>, _ctx: unknown) =>
    fn(OUTER_CLIENT)
  ),
}));

vi.mock('../../lib/redis.js', () => ({ redis: { __client: 'redis' } }));
vi.mock('../../modules/abac/engine.js', () => ({
  setAbacMembership: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../modules/user-management/repository.js', () => ({
  findRawProfile: vi.fn(),
  softDeleteProfile: vi.fn().mockResolvedValue(1),
  removeAllMemberships: vi.fn().mockResolvedValue([]),
  lockTenantAdminRemoval: vi.fn().mockResolvedValue(undefined),
}));

import { removeUser } from '../../modules/user-management/service-remove.js';
import {
  findRawProfile,
  removeAllMemberships,
  softDeleteProfile,
  lockTenantAdminRemoval,
} from '../../modules/user-management/repository.js';
import {
  fetchTenantAdminKeycloakIds,
  assertNotLastTenantAdmin,
} from '../../modules/user-management/admin-guard.js';

const mockFindRawProfile = vi.mocked(findRawProfile);
const mockRemoveAllMemberships = vi.mocked(removeAllMemberships);
const mockSoftDeleteProfile = vi.mocked(softDeleteProfile);
const mockLock = vi.mocked(lockTenantAdminRemoval);
const mockFetchAdminIds = vi.mocked(fetchTenantAdminKeycloakIds);
const mockAssertGuard = vi.mocked(assertNotLastTenantAdmin);

const fakeTenantContext = {
  tenantId: 'tenant-1',
  slug: 'acme',
  realmName: 'acme-realm',
  schemaName: 'tenant_acme',
} as Parameters<typeof removeUser>[3];

const fakeProfile = {
  userId: 'user-123',
  keycloakUserId: 'kc-user-abc',
  status: 'active',
};

const remove = (): Promise<void> =>
  removeUser('user-123', 'actor-456', { reassignments: [] }, fakeTenantContext);

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations — re-stub every default so a
  // per-test mockImplementation cannot leak into the next test.
  mockFindRawProfile.mockResolvedValue(fakeProfile);
  mockRemoveAllMemberships.mockResolvedValue([]);
  mockSoftDeleteProfile.mockResolvedValue(1);
  mockFetchAdminIds.mockResolvedValue(null);
  mockAssertGuard.mockResolvedValue(undefined);
  mockLock.mockResolvedValue(undefined);
});

describe('removeUser — TOCTOU advisory lock wiring', () => {
  it('takes the tenant lock once, on the TX client, before the authoritative re-check and the mutations', async () => {
    // Call order recorded by the mocks themselves (same idiom as the
    // disable→terminate ordering test in user-management-remove.test.ts).
    const sequence: string[] = [];
    mockFetchAdminIds.mockImplementation(async () => {
      sequence.push('kc-fetch');
      return new Set([fakeProfile.keycloakUserId]);
    });
    mockAssertGuard.mockImplementation(
      // TX_CLIENT is an untyped hoisted double — cast across the ADR-028
      // tenant-client type boundary for the identity comparison.
      async (db) =>
        void sequence.push(
          db === (TX_CLIENT as unknown as typeof db) ? 'assert:tx' : 'assert:outer'
        )
    );
    mockLock.mockImplementation(async () => void sequence.push('lock'));
    mockRemoveAllMemberships.mockImplementation(async () => {
      sequence.push('memberships');
      return [];
    });
    mockSoftDeleteProfile.mockImplementation(async () => {
      sequence.push('soft-delete');
      return 1;
    });

    await remove();

    expect(mockLock).toHaveBeenCalledOnce();
    const lockClient = mockLock.mock.calls[0]?.[0];
    expect(lockClient).toBe(TX_CLIENT);
    expect(lockClient).not.toBe(OUTER_CLIENT);
    expect(mockLock.mock.calls[0]?.[1]).toBe('tenant-1');

    // fetch (outside the tx) → fast path → lock → authoritative re-check →
    // memberships → soft delete: the lock must strictly precede both the
    // re-check and the mutations it protects.
    expect(sequence).toEqual([
      'kc-fetch',
      'assert:outer',
      'lock',
      'assert:tx',
      'memberships',
      'soft-delete',
    ]);
  });

  it('never takes the lock when the target is not in the Keycloak admin set', async () => {
    mockFetchAdminIds.mockResolvedValue(new Set(['kc-another-admin']));

    await remove();

    // "Member removals never serialize" — this property must not regress.
    expect(mockLock).not.toHaveBeenCalled();
    expect(mockSoftDeleteProfile).toHaveBeenCalledOnce();
    expect(mockSoftDeleteProfile).toHaveBeenCalledWith(TX_CLIENT, 'user-123');
  });

  it('never takes the lock when the Keycloak admin set is empty', async () => {
    mockFetchAdminIds.mockResolvedValue(new Set<string>());

    await remove();

    expect(mockLock).not.toHaveBeenCalled();
    expect(mockSoftDeleteProfile).toHaveBeenCalledOnce();
  });

  it('never takes the lock when the admin set is null (Keycloak down — documented fail-open)', async () => {
    await remove(); // default stub: fetchTenantAdminKeycloakIds → null

    expect(mockLock).not.toHaveBeenCalled();
    // Fail-open skips the in-transaction authoritative re-check entirely:
    // only the (no-op) fast path ran, on the outer client, with the null set.
    expect(mockAssertGuard).toHaveBeenCalledOnce();
    const guardClient = mockAssertGuard.mock.calls[0]?.[0];
    expect(guardClient).toBe(OUTER_CLIENT);
    expect(guardClient).not.toBe(TX_CLIENT);
    expect(mockAssertGuard.mock.calls[0]?.[3]).toBeNull();
    expect(mockSoftDeleteProfile).toHaveBeenCalledOnce();
  });
});
