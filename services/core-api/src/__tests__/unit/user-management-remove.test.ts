// user-management-remove.test.ts
// Unit tests for removeUser: Keycloak calls, audit written on the OUTER
// (non-transactional) client, ABAC revocation tombstones, TOCTOU guard.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Two DISTINGUISHABLE fake clients, hoisted for the vi.mock factories: `db`
// and `tx` must be assertable apart (see writeAuditLog client-routing below).
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

// Last-admin guard mocked (unit-tested in user-management-admin-guard.test.ts) — default fail-open.
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

// Mock Redis + the ABAC write-through so revocation is assertable without Redis
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
import { disableRealmUser, terminateUserSessions } from '../../lib/keycloak-admin-users.js';
import {
  findRawProfile,
  removeAllMemberships,
  softDeleteProfile,
} from '../../modules/user-management/repository.js';
import { setAbacMembership } from '../../modules/abac/engine.js';
import { writeAuditLog } from '../../modules/audit-log/writer.js';
import { logger } from '../../lib/logger.js';

const mockFindRawProfile = vi.mocked(findRawProfile);
const mockRemoveAllMemberships = vi.mocked(removeAllMemberships);
const mockSoftDeleteProfile = vi.mocked(softDeleteProfile);
const mockTerminateSessions = vi.mocked(terminateUserSessions);
const mockDisableUser = vi.mocked(disableRealmUser);
const mockSetAbacMembership = vi.mocked(setAbacMembership);
const mockWriteAuditLog = vi.mocked(writeAuditLog);
const mockLogger = vi.mocked(logger);

const fakeTenantContext = {
  tenantId: 'tenant-1',
  slug: 'acme',
  realmName: 'acme-realm',
  schemaName: 'tenant_acme',
} as Parameters<typeof removeUser>[3];

const fakeProfile = {
  userId: 'user-123',
  keycloakUserId: 'kc-user-abc',
  email: 'user@acme.io',
  status: 'active',
  displayName: 'Test User',
};

const remove = (): Promise<void> =>
  removeUser('user-123', 'actor-456', { reassignments: [] }, fakeTenantContext);

beforeEach(() => {
  vi.clearAllMocks();
  mockFindRawProfile.mockResolvedValue(fakeProfile as never);
  mockRemoveAllMemberships.mockResolvedValue([]);
  mockSoftDeleteProfile.mockResolvedValue(1);
});

describe('removeUser — terminateUserSessions', () => {
  it('calls terminateUserSessions with realm and keycloakUserId', async () => {
    await remove();
    expect(mockTerminateSessions).toHaveBeenCalledOnce();
    expect(mockTerminateSessions).toHaveBeenCalledWith('acme-realm', 'kc-user-abc');
  });

  it('calls disableRealmUser before terminateUserSessions', async () => {
    const callOrder: string[] = [];
    mockDisableUser.mockImplementation(async () => void callOrder.push('disable'));
    mockTerminateSessions.mockImplementation(async () => void callOrder.push('terminate'));

    await remove();
    expect(callOrder).toEqual(['disable', 'terminate']);
  });

  it('logs error but does not throw when terminateUserSessions fails', async () => {
    mockTerminateSessions.mockRejectedValue(new Error('KC session delete failed'));
    await expect(remove()).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ targetUserId: 'user-123', realm: 'acme-realm' }),
      expect.stringContaining('terminate')
    );
  });

  it('logs error but does not throw when disableRealmUser fails', async () => {
    mockDisableUser.mockRejectedValue(new Error('KC disable failed'));
    await expect(remove()).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ targetUserId: 'user-123', realm: 'acme-realm' }),
      expect.stringContaining('disable')
    );
  });
});

describe('removeUser — client routing and ABAC revocation', () => {
  it('writes the audit log on the OUTER client, never on the transaction client', async () => {
    await remove();

    expect(mockWriteAuditLog).toHaveBeenCalledOnce();
    const auditClient = mockWriteAuditLog.mock.calls[0]?.[0];
    expect(auditClient).toBe(OUTER_CLIENT);
    expect(auditClient).not.toBe(TX_CLIENT);
  });

  it('runs the read and both mutations on the transaction client', async () => {
    await remove();

    expect(mockFindRawProfile).toHaveBeenCalledWith(TX_CLIENT, 'user-123');
    expect(mockRemoveAllMemberships).toHaveBeenCalledWith(TX_CLIENT, 'user-123');
    expect(mockSoftDeleteProfile).toHaveBeenCalledWith(TX_CLIENT, 'user-123');
  });

  it('publishes a role:null tombstone for every removed membership', async () => {
    mockRemoveAllMemberships.mockResolvedValue(['ws-1', 'ws-2', 'ws-3']);
    await remove();

    expect(mockSetAbacMembership).toHaveBeenCalledTimes(3);
    for (const workspaceId of ['ws-1', 'ws-2', 'ws-3']) {
      expect(mockSetAbacMembership).toHaveBeenCalledWith(
        'acme',
        'user-123',
        workspaceId,
        { role: null },
        expect.anything()
      );
    }
  });

  it('publishes nothing when the user had no memberships', async () => {
    await remove();
    expect(mockSetAbacMembership).not.toHaveBeenCalled();
  });

  it('logs a Redis failure without throwing and still reaches Keycloak', async () => {
    mockRemoveAllMemberships.mockResolvedValue(['ws-1']);
    mockSetAbacMembership.mockRejectedValue(new Error('redis down'));
    await expect(remove()).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', tenantSlug: 'acme' }),
      expect.stringContaining('revocation failed')
    );
    expect(mockTerminateSessions).toHaveBeenCalledOnce();
  });

  it('throws and skips every post-commit step when the soft delete matches 0 rows', async () => {
    mockRemoveAllMemberships.mockResolvedValue(['ws-1']);
    mockSoftDeleteProfile.mockResolvedValue(0);
    await expect(remove()).rejects.toThrow(/not found/i);

    expect(mockWriteAuditLog).not.toHaveBeenCalled();
    expect(mockSetAbacMembership).not.toHaveBeenCalled();
    expect(mockDisableUser).not.toHaveBeenCalled();
    expect(mockTerminateSessions).not.toHaveBeenCalled();
  });
});
