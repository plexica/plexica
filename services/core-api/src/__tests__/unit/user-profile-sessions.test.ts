// user-profile-sessions.test.ts
// UNIT: user-profile session orchestration (006-13) — the 503/502 split.
// A Keycloak transport failure (plain Error) maps to 503 SERVICE_UNAVAILABLE;
// a Keycloak HTTP 5xx (KeycloakError) passes through as 502. A successful
// revocation writes the security audit entry (mirrors profile/avatar).
// Keycloak Admin client + logger mocked; no live stack.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/keycloak-admin-users.js', () => ({
  listUserSessions: vi.fn(),
  deleteUserSession: vi.fn(),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AppError, KeycloakError, ServiceUnavailableError } from '../../lib/app-error.js';
import { deleteUserSession, listUserSessions } from '../../lib/keycloak-admin-users.js';
import { listSessions, revokeSession } from '../../modules/user-profile/sessions.js';

import type { KeycloakUserSession } from '../../lib/keycloak-admin-users.js';
import type { TenantPrismaClient } from '../../lib/tenant-database.js';

const REALM = 'plexica-test';
const KC_USER_ID = '11111111-2222-4333-8444-555555555555';
const SESSION_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';

const listMock = vi.mocked(listUserSessions);
const deleteMock = vi.mocked(deleteUserSession);

function ownedSession(): KeycloakUserSession {
  return {
    id: SESSION_ID,
    username: 'user@test.io',
    userId: KC_USER_ID,
    ipAddress: '10.0.0.1',
    start: 1_700_000_000_000,
    lastAccess: 1_700_000_060_000,
    clients: { 'client-uuid-1': 'plexica-web' },
  };
}

function profileRow(): unknown {
  return {
    userId: 'c0ffee00-0000-4000-8000-000000000001',
    keycloakUserId: KC_USER_ID,
    email: 'user@test.io',
    displayName: 'Test User',
    avatarPath: null,
    timezone: 'UTC',
    language: 'en',
    notificationPrefs: {},
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

/** Plain stub — no $queryRaw, so the audit writer's guard lets it through. */
function stubTenantDb(row: unknown): {
  db: TenantPrismaClient;
  auditCreate: ReturnType<typeof vi.fn>;
} {
  const auditCreate = vi.fn(async () => ({}));
  const db = {
    userProfile: { findUnique: vi.fn(async () => row) },
    auditLog: { create: auditCreate },
  } as unknown as TenantPrismaClient;
  return { db, auditCreate };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listSessions error mapping (006-13)', () => {
  it('maps a Keycloak transport failure to 503 SERVICE_UNAVAILABLE', async () => {
    listMock.mockRejectedValue(new Error('fetch failed'));

    const err = await listSessions(REALM, KC_USER_ID).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ServiceUnavailableError);
    expect((err as AppError).statusCode).toBe(503);
  });

  it('passes a Keycloak HTTP 5xx (KeycloakError) through as 502', async () => {
    listMock.mockRejectedValue(new KeycloakError('Keycloak responded 500'));

    const err = await listSessions(REALM, KC_USER_ID).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(KeycloakError);
    expect((err as AppError).statusCode).toBe(502);
  });
});

describe('revokeSession error mapping + audit (006-13)', () => {
  it('maps a transport failure on the ownership read to 503 (no delete)', async () => {
    listMock.mockRejectedValue(new Error('connection refused'));
    const { db, auditCreate } = stubTenantDb(profileRow());

    const err = await revokeSession(db, REALM, KC_USER_ID, SESSION_ID).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ServiceUnavailableError);
    expect((err as AppError).statusCode).toBe(503);
    expect(deleteMock).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('passes a Keycloak HTTP 5xx on delete through as 502 (no audit)', async () => {
    listMock.mockResolvedValue([ownedSession()]);
    deleteMock.mockRejectedValue(new KeycloakError('Keycloak responded 503'));
    const { db, auditCreate } = stubTenantDb(profileRow());

    const err = await revokeSession(db, REALM, KC_USER_ID, SESSION_ID).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(KeycloakError);
    expect((err as AppError).statusCode).toBe(502);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('writes the session.revoke audit entry on success', async () => {
    listMock.mockResolvedValue([ownedSession()]);
    deleteMock.mockResolvedValue(undefined);
    const { db, auditCreate } = stubTenantDb(profileRow());

    await expect(revokeSession(db, REALM, KC_USER_ID, SESSION_ID)).resolves.toEqual({
      revoked: true,
    });
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(auditCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        actionType: 'session.revoke',
        targetType: 'user_session',
        targetId: SESSION_ID,
      },
    });
  });
});
