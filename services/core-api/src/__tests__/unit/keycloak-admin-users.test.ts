// keycloak-admin-users.test.ts
// UNIT: Keycloak Admin user-session helpers (006-13) — URL building, request
// contracts, and error mapping against a stubbed Keycloak Admin HTTP layer.
// No live Keycloak; the INT suite covers the real API.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KeycloakError } from '../../lib/app-error.js';
import { invalidateAdminTokenCache } from '../../lib/keycloak-admin-internal.js';
import {
  deleteUserSession,
  getRealmUserEmail,
  listUserSessions,
  syncDisplayName,
  syncEmail,
} from '../../lib/keycloak-admin-users.js';

const REALM = 'plexica-test';
const USER_ID = '11111111-2222-4333-8444-555555555555';
const SESSION_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(payload),
  } as Response;
}

function tokenResponse(): Response {
  return jsonResponse(200, { access_token: 'admin-token', expires_in: 60 });
}

/** Stubs global fetch: token endpoint + programmable Admin API responses. */
function stubKeycloak(adminImpl: (call: { url: string; method: string }) => Response): {
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/protocol/openid-connect/token')) return Promise.resolve(tokenResponse());
      const method = init?.method ?? 'GET';
      let body: unknown;
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body) as unknown;
        } catch {
          body = init.body;
        }
      }
      calls.push({ url, method, body });
      return Promise.resolve(adminImpl({ url, method }));
    })
  );
  return { calls };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  invalidateAdminTokenCache();
});

describe('listUserSessions', () => {
  it('GETs the user sessions endpoint and returns the parsed sessions', async () => {
    const payload = [
      {
        id: SESSION_ID,
        username: 'user@test.io',
        userId: USER_ID,
        ipAddress: '10.0.0.1',
        start: 1_700_000_000_000,
        lastAccess: 1_700_000_060_000,
        clients: { 'client-uuid-1': 'plexica-web' },
      },
    ];
    const { calls } = stubKeycloak(() => jsonResponse(200, payload));

    const sessions = await listUserSessions(REALM, USER_ID);

    expect(sessions).toEqual(payload);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.endsWith(`/admin/realms/${REALM}/users/${USER_ID}/sessions`)).toBe(true);
  });

  it('maps a Keycloak failure to KeycloakError', async () => {
    stubKeycloak(() => jsonResponse(500, {}));
    await expect(listUserSessions(REALM, USER_ID)).rejects.toBeInstanceOf(KeycloakError);
  });

  it('sends the cached admin token as a Bearer header', async () => {
    stubKeycloak(() => jsonResponse(200, []));
    await listUserSessions(REALM, USER_ID);
    await listUserSessions(REALM, USER_ID);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const authHeaders = fetchMock.mock.calls
      .map((call) => (call[1] as RequestInit | undefined)?.headers)
      .filter(
        (headers): headers is Record<string, string> =>
          typeof headers === 'object' && headers !== null && 'Authorization' in headers
      )
      .map((headers) => headers['Authorization']);
    // Token endpoint (no auth header) + two admin calls sharing one token fetch.
    expect(authHeaders).toEqual(['Bearer admin-token', 'Bearer admin-token']);
  });
});

describe('deleteUserSession', () => {
  it('DELETEs the realm session endpoint', async () => {
    const { calls } = stubKeycloak(() => jsonResponse(204, null));

    await deleteUserSession(REALM, SESSION_ID);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url.endsWith(`/admin/realms/${REALM}/sessions/${SESSION_ID}`)).toBe(true);
  });

  it('tolerates 404 (session already expired)', async () => {
    stubKeycloak(() => jsonResponse(404, {}));
    await expect(deleteUserSession(REALM, SESSION_ID)).resolves.toBeUndefined();
  });

  it('maps other failures to KeycloakError', async () => {
    stubKeycloak(() => jsonResponse(500, {}));
    await expect(deleteUserSession(REALM, SESSION_ID)).rejects.toBeInstanceOf(KeycloakError);
  });
});

describe('syncEmail', () => {
  it('PUTs the new email with emailVerified reset', async () => {
    const { calls } = stubKeycloak(() => jsonResponse(204, null));

    await syncEmail(REALM, USER_ID, 'new@test.io');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.url.endsWith(`/admin/realms/${REALM}/users/${USER_ID}`)).toBe(true);
    expect(calls[0]?.body).toEqual({ email: 'new@test.io', emailVerified: false });
  });

  it('maps a Keycloak rejection to KeycloakError (caller must not write locally)', async () => {
    stubKeycloak(() => jsonResponse(409, {}));
    await expect(syncEmail(REALM, USER_ID, 'taken@test.io')).rejects.toBeInstanceOf(KeycloakError);
  });
});

describe('getRealmUserEmail', () => {
  it('GETs the user and returns the stored email (rollback source)', async () => {
    const { calls } = stubKeycloak(() => jsonResponse(200, { email: 'real@test.io' }));

    await expect(getRealmUserEmail(REALM, USER_ID)).resolves.toBe('real@test.io');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.endsWith(`/admin/realms/${REALM}/users/${USER_ID}`)).toBe(true);
  });

  it('returns an empty string when Keycloak stores no email', async () => {
    stubKeycloak(() => jsonResponse(200, { username: 'no-email' }));
    await expect(getRealmUserEmail(REALM, USER_ID)).resolves.toBe('');
  });

  it('maps a Keycloak failure to KeycloakError (caller aborts before mutating)', async () => {
    stubKeycloak(() => jsonResponse(500, {}));
    await expect(getRealmUserEmail(REALM, USER_ID)).rejects.toBeInstanceOf(KeycloakError);
  });
});

describe('syncDisplayName', () => {
  it('PUTs firstName/lastName split from the display name', async () => {
    const { calls } = stubKeycloak(() => jsonResponse(204, null));

    await syncDisplayName(REALM, USER_ID, 'Ada Lovelace King');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.url.endsWith(`/admin/realms/${REALM}/users/${USER_ID}`)).toBe(true);
    expect(calls[0]?.body).toEqual({ firstName: 'Ada', lastName: 'Lovelace King' });
  });
});
