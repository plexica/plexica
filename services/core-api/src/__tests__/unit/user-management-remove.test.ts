// user-management-remove.test.ts
// Unit tests for removeUser — verifies terminateUserSessions is called
// with correct args, and that a Keycloak failure is logged but does not throw.
// F07 fix — April 2026.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Keycloak admin functions before importing the service
vi.mock('../../lib/keycloak-admin-users.js', () => ({
  disableRealmUser: vi.fn().mockResolvedValue(undefined),
  terminateUserSessions: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock audit log writer
vi.mock('../../modules/audit-log/writer.js', () => ({
  writeAuditLog: vi.fn(),
}));

// Mock withTenantDb — runs the callback immediately with a fake tx
vi.mock('../../lib/tenant-database.js', () => ({
  withTenantDb: vi.fn(async (fn: (tx: unknown) => Promise<unknown>, _ctx: unknown) => fn({})),
}));

// Mock repository functions
vi.mock('../../modules/user-management/repository.js', () => ({
  findRawProfile: vi.fn(),
  softDeleteProfile: vi.fn().mockResolvedValue(undefined),
  removeAllMemberships: vi.fn().mockResolvedValue(undefined),
}));

import { removeUser } from '../../modules/user-management/service-remove.js';
import { disableRealmUser, terminateUserSessions } from '../../lib/keycloak-admin-users.js';
import { findRawProfile } from '../../modules/user-management/repository.js';
import { logger } from '../../lib/logger.js';

const mockFindRawProfile = vi.mocked(findRawProfile);
const mockTerminateSessions = vi.mocked(terminateUserSessions);
const mockDisableUser = vi.mocked(disableRealmUser);
const mockLogger = vi.mocked(logger);

const fakeTenantContext = {
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

beforeEach(() => {
  vi.clearAllMocks();
  mockFindRawProfile.mockResolvedValue(fakeProfile as never);
});

describe('removeUser — terminateUserSessions', () => {
  it('calls terminateUserSessions with realm and keycloakUserId', async () => {
    await removeUser('user-123', 'actor-456', { reassignments: [] }, fakeTenantContext);

    expect(mockTerminateSessions).toHaveBeenCalledOnce();
    expect(mockTerminateSessions).toHaveBeenCalledWith('acme-realm', 'kc-user-abc');
  });

  it('calls disableRealmUser before terminateUserSessions', async () => {
    const callOrder: string[] = [];
    mockDisableUser.mockImplementation(async () => {
      callOrder.push('disable');
    });
    mockTerminateSessions.mockImplementation(async () => {
      callOrder.push('terminate');
    });

    await removeUser('user-123', 'actor-456', { reassignments: [] }, fakeTenantContext);

    expect(callOrder).toEqual(['disable', 'terminate']);
  });

  it('logs error but does not throw when terminateUserSessions fails', async () => {
    mockTerminateSessions.mockRejectedValue(new Error('KC session delete failed'));

    // Should not throw
    await expect(
      removeUser('user-123', 'actor-456', { reassignments: [] }, fakeTenantContext)
    ).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ targetUserId: 'user-123', realm: 'acme-realm' }),
      expect.stringContaining('terminate')
    );
  });

  it('logs error but does not throw when disableRealmUser fails', async () => {
    mockDisableUser.mockRejectedValue(new Error('KC disable failed'));

    await expect(
      removeUser('user-123', 'actor-456', { reassignments: [] }, fakeTenantContext)
    ).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ targetUserId: 'user-123', realm: 'acme-realm' }),
      expect.stringContaining('disable')
    );
  });
});
