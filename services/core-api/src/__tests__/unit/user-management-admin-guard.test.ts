// user-management-admin-guard.test.ts
// Unit tests for the last-admin guard: the Keycloak admin-set fetch (with its
// fail-open contract) and the DB-side remaining-admin check. Both phases of
// the guard (pre-transaction fast path and authoritative in-transaction
// re-check) run the same function — the tx/lock orchestration around it is
// covered by user-management-remove.test.ts and the concurrency integration
// test in user-management-remove-race.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/keycloak-admin-internal.js', () => ({ adminRequest: vi.fn() }));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../modules/user-management/repository.js', () => ({
  findActiveProfileKeycloakIds: vi.fn(),
}));

import {
  fetchTenantAdminKeycloakIds,
  assertNotLastTenantAdmin,
} from '../../modules/user-management/admin-guard.js';
import { adminRequest } from '../../lib/keycloak-admin-internal.js';
import { findActiveProfileKeycloakIds } from '../../modules/user-management/repository.js';
import { logger } from '../../lib/logger.js';
import { ConflictError } from '../../lib/app-error.js';

const mockAdminRequest = vi.mocked(adminRequest);
const mockFindActive = vi.mocked(findActiveProfileKeycloakIds);
const mockLogger = vi.mocked(logger);

function kcResponse(ok: boolean, status: number, body: unknown): Response {
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchTenantAdminKeycloakIds', () => {
  it('returns the set of Keycloak user ids holding tenant_admin', async () => {
    mockAdminRequest.mockResolvedValue(kcResponse(true, 200, [{ id: 'kc-1' }, { id: 'kc-2' }]));

    const ids = await fetchTenantAdminKeycloakIds('realm-x');

    expect(ids).toEqual(new Set(['kc-1', 'kc-2']));
    expect(mockAdminRequest).toHaveBeenCalledWith(
      '/admin/realms/realm-x/roles/tenant_admin/users',
      'GET'
    );
  });

  it('returns null when Keycloak answers with an error status', async () => {
    mockAdminRequest.mockResolvedValue(kcResponse(false, 404, null));
    await expect(fetchTenantAdminKeycloakIds('realm-x')).resolves.toBeNull();
  });

  // FAIL-OPEN CONTRACT (documented in admin-guard.ts): a Keycloak outage must
  // not turn into a total user-management outage — the DB-side removal still
  // proceeds, unguarded, exactly like disableRealmUser/terminateUserSessions
  // failures already do in service-remove.ts.
  it('returns null and logs when Keycloak is unreachable (network error)', async () => {
    mockAdminRequest.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(fetchTenantAdminKeycloakIds('realm-x')).resolves.toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ realm: 'realm-x' }),
      expect.stringContaining('proceeding without the last-admin guard')
    );
  });
});

describe('assertNotLastTenantAdmin', () => {
  // Untyped stand-in for the tenant client: repository access is mocked, so
  // the double only needs to be distinguishable, not real. Cast across the
  // ADR-028 tenant-client type boundary.
  const DB = { __client: 'db' } as unknown as Parameters<typeof assertNotLastTenantAdmin>[0];

  it('throws ConflictError when the target is the only active admin', async () => {
    mockFindActive.mockResolvedValue([{ userId: 'u-1', keycloakUserId: 'kc-1' }]);

    await expect(assertNotLastTenantAdmin(DB, 'u-1', 'kc-1', new Set(['kc-1']))).rejects.toThrow(
      ConflictError
    );
    await expect(assertNotLastTenantAdmin(DB, 'u-1', 'kc-1', new Set(['kc-1']))).rejects.toThrow(
      'Cannot remove the last active tenant admin'
    );
  });

  it('does not throw when another active admin remains', async () => {
    mockFindActive.mockResolvedValue([
      { userId: 'u-1', keycloakUserId: 'kc-1' },
      { userId: 'u-2', keycloakUserId: 'kc-2' },
    ]);

    await expect(
      assertNotLastTenantAdmin(DB, 'u-1', 'kc-1', new Set(['kc-1', 'kc-2']))
    ).resolves.toBeUndefined();
  });

  it('is a no-op for a target that does not hold tenant_admin (never queries the DB)', async () => {
    await expect(
      assertNotLastTenantAdmin(DB, 'u-1', 'kc-1', new Set(['kc-2']))
    ).resolves.toBeUndefined();
    expect(mockFindActive).not.toHaveBeenCalled();
  });

  // FAIL-OPEN documented: when Keycloak is down the caller passes a null set
  // and the guard steps aside entirely — no DB query, no throw. The removal
  // proceeds unguarded; this is the deliberate trade-off of admin-guard.ts.
  it('is a no-op when the admin set is null (Keycloak unreachable) — fail-open', async () => {
    await expect(assertNotLastTenantAdmin(DB, 'u-1', 'kc-1', null)).resolves.toBeUndefined();
    expect(mockFindActive).not.toHaveBeenCalled();
  });

  it('does not count admins whose profiles are no longer active in this tenant', async () => {
    // kc-2 still holds the role in Keycloak but its profile was removed —
    // findActiveProfileKeycloakIds only returns ACTIVE profiles, so the stub
    // below correctly omits it: kc-1 is effectively the last admin.
    mockFindActive.mockResolvedValue([{ userId: 'u-1', keycloakUserId: 'kc-1' }]);

    await expect(
      assertNotLastTenantAdmin(DB, 'u-1', 'kc-1', new Set(['kc-1', 'kc-2']))
    ).rejects.toThrow(ConflictError);
  });
});
