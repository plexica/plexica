// apps/core-api/src/__tests__/auth/unit/keycloak.service.test.ts
//
// Unit tests for KeycloakService.
// Strategy: subclass KeycloakService to expose protected members and replace
// `this.client` with a vi.fn() mock before each test.  fetch() is stubbed via
// vi.stubGlobal so the token-endpoint methods (exchangeAuthorizationCode,
// refreshToken, revokeToken) never hit the network.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeycloakService, KeycloakSanitizedError } from '../../../services/keycloak.service.js';

// ─── Module mocks ──────────────────────────────────────────────────────────

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../config/index.js', () => ({
  config: {
    keycloakUrl: 'http://localhost:8080',
    keycloakRealm: 'master',
    keycloakClientId: 'admin-cli',
    keycloakClientSecret: undefined,
    keycloakAdminUsername: 'admin',
    keycloakAdminPassword: 'admin',
  },
}));

// Mock KcAdminClient so the constructor never dials Keycloak.
// Must be a real class (not just vi.fn()) because KeycloakService does `new KcAdminClient(...)`.
vi.mock('@keycloak/keycloak-admin-client', () => {
  class MockKcAdminClient {
    auth = vi.fn();
    setConfig = vi.fn();
    realms = {
      create: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      del: vi.fn(),
    };
    clients = {
      find: vi.fn(),
      create: vi.fn(),
    };
    roles = {
      findOneByName: vi.fn(),
      create: vi.fn(),
      find: vi.fn(),
    };
    users = {
      create: vi.fn(),
      findOne: vi.fn(),
      find: vi.fn(),
      del: vi.fn(),
      resetPassword: vi.fn(),
      addRealmRoleMappings: vi.fn(),
      executeActionsEmail: vi.fn(),
    };
  }
  return { default: MockKcAdminClient };
});

// ─── Test subclass to access protected members ─────────────────────────────

class TestKeycloakService extends KeycloakService {
  // Expose protected helpers for direct testing
  callWithRetry<T>(op: () => Promise<T>) {
    return this.withRetry(op);
  }

  callWithRealmScope<T>(realm: string, op: () => Promise<T>) {
    return this.withRealmScope(realm, op);
  }

  get kcClient() {
    return this.client;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOkFetchResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

function makeErrorFetchResponse(status: number, text = 'error') {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ error: text }),
    text: vi.fn().mockResolvedValue(text),
  };
}

const MOCK_TOKEN_RESPONSE = {
  access_token: 'access-token-abc',
  expires_in: 900,
  refresh_expires_in: 1800,
  refresh_token: 'refresh-token-xyz',
  token_type: 'Bearer',
  scope: 'openid',
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('KeycloakSanitizedError', () => {
  it('should set name, message and statusCode', () => {
    const err = new KeycloakSanitizedError('test message', 401);
    expect(err.name).toBe('KeycloakSanitizedError');
    expect(err.message).toBe('test message');
    expect(err.statusCode).toBe(401);
  });

  it('should be instance of Error', () => {
    const err = new KeycloakSanitizedError('msg');
    expect(err).toBeInstanceOf(Error);
  });

  it('should work without statusCode', () => {
    const err = new KeycloakSanitizedError('no status');
    expect(err.statusCode).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('KeycloakService', () => {
  let svc: TestKeycloakService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new TestKeycloakService();
    // Make initialize() a no-op so ensureAuth() never dials Keycloak
    vi.spyOn(svc as unknown as { initialize: () => Promise<void> }, 'initialize').mockResolvedValue(
      undefined
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── withRetry ─────────────────────────────────────────────────────────────

  describe('withRetry()', () => {
    it('should return the result of the operation on success', async () => {
      const result = await svc.callWithRetry(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
    });

    it('should re-authenticate and retry once on raw 401 error', async () => {
      const reAuth = vi
        .spyOn(svc as unknown as { reAuthenticate: () => Promise<void> }, 'reAuthenticate')
        .mockResolvedValue(undefined);

      let callCount = 0;
      const op = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const err = Object.assign(new Error('401'), { response: { status: 401 } });
          return Promise.reject(err);
        }
        return Promise.resolve('retried');
      });

      const result = await svc.callWithRetry(op);
      expect(result).toBe('retried');
      expect(reAuth).toHaveBeenCalledOnce();
      expect(op).toHaveBeenCalledTimes(2);
    });

    it('should re-authenticate and retry on KeycloakSanitizedError with statusCode 401', async () => {
      const reAuth = vi
        .spyOn(svc as unknown as { reAuthenticate: () => Promise<void> }, 'reAuthenticate')
        .mockResolvedValue(undefined);

      let callCount = 0;
      const op = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new KeycloakSanitizedError('auth failed', 401));
        }
        return Promise.resolve('ok');
      });

      await svc.callWithRetry(op);
      expect(reAuth).toHaveBeenCalledOnce();
    });

    it('should rethrow non-401 errors without retrying', async () => {
      const reAuth = vi
        .spyOn(svc as unknown as { reAuthenticate: () => Promise<void> }, 'reAuthenticate')
        .mockResolvedValue(undefined);

      const op = vi.fn().mockRejectedValue(new Error('500 server error'));

      await expect(svc.callWithRetry(op)).rejects.toThrow('500 server error');
      expect(reAuth).not.toHaveBeenCalled();
    });
  });

  // ── withRealmScope ────────────────────────────────────────────────────────

  describe('withRealmScope()', () => {
    it('should set realm, run operation, and reset to master', async () => {
      const result = await svc.callWithRealmScope('acme', () => Promise.resolve('value'));
      expect(svc.kcClient.setConfig).toHaveBeenCalledWith({ realmName: 'acme' });
      expect(svc.kcClient.setConfig).toHaveBeenCalledWith({ realmName: 'master' });
      expect(result).toBe('value');
    });

    it('should reset to master even when operation throws', async () => {
      await expect(
        svc.callWithRealmScope('acme', () => Promise.reject(new Error('boom')))
      ).rejects.toThrow('boom');
      expect(svc.kcClient.setConfig).toHaveBeenCalledWith({ realmName: 'master' });
    });

    it('should serialize concurrent realm-scoped operations', async () => {
      const order: string[] = [];
      const op1 = async () => {
        order.push('op1-start');
        await new Promise((r) => setTimeout(r, 5));
        order.push('op1-end');
        return 'op1';
      };
      const op2 = async () => {
        order.push('op2-start');
        order.push('op2-end');
        return 'op2';
      };

      const [r1, r2] = await Promise.all([
        svc.callWithRealmScope('realm-a', op1),
        svc.callWithRealmScope('realm-b', op2),
      ]);

      expect(r1).toBe('op1');
      expect(r2).toBe('op2');
      // op2 must not start until op1 finishes (mutex serialises them)
      expect(order.indexOf('op2-start')).toBeGreaterThan(order.indexOf('op1-end'));
    });
  });

  // ── createRealm ───────────────────────────────────────────────────────────

  describe('createRealm()', () => {
    it('should create a realm when it does not exist', async () => {
      vi.mocked(svc.kcClient.realms.findOne).mockResolvedValue(undefined);
      vi.mocked(svc.kcClient.realms.create).mockResolvedValue({ realmName: 'acme' } as never);

      await svc.createRealm('acme', 'Acme Corp');

      expect(svc.kcClient.realms.create).toHaveBeenCalledOnce();
      expect(vi.mocked(svc.kcClient.realms.create).mock.calls[0]![0]).toMatchObject({
        realm: 'acme',
        displayName: 'Acme Corp',
        enabled: true,
      });
    });

    it('should be a no-op when realm already exists', async () => {
      vi.mocked(svc.kcClient.realms.findOne).mockResolvedValue({ realm: 'acme' } as never);

      await svc.createRealm('acme', 'Acme Corp');

      expect(svc.kcClient.realms.create).not.toHaveBeenCalled();
    });

    it('should set bruteForceProtected and PKCE-friendly token lifetimes', async () => {
      vi.mocked(svc.kcClient.realms.findOne).mockResolvedValue(undefined);
      vi.mocked(svc.kcClient.realms.create).mockResolvedValue({ realmName: 'acme' } as never);

      await svc.createRealm('acme', 'Acme Corp');

      expect(vi.mocked(svc.kcClient.realms.create).mock.calls[0]![0]).toMatchObject({
        bruteForceProtected: true,
        accessTokenLifespan: 900,
      });
    });
  });

  // ── getRealm / realmExists ────────────────────────────────────────────────

  describe('getRealm()', () => {
    it('should return realm representation when found', async () => {
      const realm = { realm: 'acme', enabled: true };
      vi.mocked(svc.kcClient.realms.findOne).mockResolvedValue(realm as never);

      const result = await svc.getRealm('acme');
      expect(result).toEqual(realm);
    });

    it('should return undefined on 404', async () => {
      const notFound = Object.assign(new Error('not found'), { response: { status: 404 } });
      vi.mocked(svc.kcClient.realms.findOne).mockRejectedValue(notFound);

      const result = await svc.getRealm('acme');
      expect(result).toBeUndefined();
    });

    it('should rethrow non-404 errors', async () => {
      const serverError = Object.assign(new Error('server error'), { response: { status: 500 } });
      vi.mocked(svc.kcClient.realms.findOne).mockRejectedValue(serverError);

      await expect(svc.getRealm('acme')).rejects.toThrow('server error');
    });
  });

  describe('realmExists()', () => {
    it('should return true when realm is found', async () => {
      vi.mocked(svc.kcClient.realms.findOne).mockResolvedValue({ realm: 'acme' } as never);
      expect(await svc.realmExists('acme')).toBe(true);
    });

    it('should return false when realm is not found', async () => {
      const notFound = Object.assign(new Error('not found'), { response: { status: 404 } });
      vi.mocked(svc.kcClient.realms.findOne).mockRejectedValue(notFound);
      expect(await svc.realmExists('acme')).toBe(false);
    });
  });

  // ── provisionRealmClients ─────────────────────────────────────────────────

  describe('provisionRealmClients()', () => {
    it('should throw on invalid realm name', async () => {
      await expect(svc.provisionRealmClients('INVALID REALM!')).rejects.toThrow(
        'Invalid realm name format'
      );
    });

    it('should create plexica-web and plexica-api clients when they do not exist', async () => {
      // clients.find returns empty array → ensureClientExists proceeds to create
      vi.mocked(svc.kcClient.clients.find).mockResolvedValue([]);
      vi.mocked(svc.kcClient.clients.create).mockResolvedValue({ clientId: 'x' } as never);

      await svc.provisionRealmClients('acme');

      expect(svc.kcClient.clients.create).toHaveBeenCalledTimes(2);
      const ids = vi
        .mocked(svc.kcClient.clients.create)
        .mock.calls.map((c) => (c[0] as { clientId: string }).clientId);
      expect(ids).toContain('plexica-web');
      expect(ids).toContain('plexica-api');
    });

    it('should skip creation when clients already exist', async () => {
      vi.mocked(svc.kcClient.clients.find).mockResolvedValue([{ clientId: 'existing' }] as never);

      await svc.provisionRealmClients('acme');

      expect(svc.kcClient.clients.create).not.toHaveBeenCalled();
    });

    it('should accept custom redirect URIs', async () => {
      vi.mocked(svc.kcClient.clients.find).mockResolvedValue([]);
      vi.mocked(svc.kcClient.clients.create).mockResolvedValue({ clientId: 'x' } as never);

      await svc.provisionRealmClients(
        'acme',
        ['https://app.example.com/*'],
        ['https://app.example.com']
      );

      const webClientCall = vi
        .mocked(svc.kcClient.clients.create)
        .mock.calls.find((c) => (c[0] as { clientId: string }).clientId === 'plexica-web');
      expect(webClientCall).toBeDefined();
      expect((webClientCall![0] as { redirectUris: string[] }).redirectUris).toEqual([
        'https://app.example.com/*',
      ]);
    });

    it('should throw KeycloakSanitizedError on provisioning failure', async () => {
      // clients.find returns empty (so create is attempted), and create fails
      vi.mocked(svc.kcClient.clients.find).mockResolvedValue([]);
      vi.mocked(svc.kcClient.clients.create).mockRejectedValue(
        Object.assign(new Error('forbidden'), { response: { status: 403, data: 'forbidden' } })
      );

      await expect(svc.provisionRealmClients('acme')).rejects.toBeInstanceOf(
        KeycloakSanitizedError
      );
    });
  });

  // ── provisionRealmRoles ───────────────────────────────────────────────────

  describe('provisionRealmRoles()', () => {
    it('should throw on invalid realm name', async () => {
      await expect(svc.provisionRealmRoles('INVALID!')).rejects.toThrow(
        'Invalid realm name format'
      );
    });

    it('should create tenant_admin and user roles when they do not exist', async () => {
      vi.mocked(svc.kcClient.roles.findOneByName).mockResolvedValue(undefined);
      vi.mocked(svc.kcClient.roles.create).mockResolvedValue({ name: 'x' } as never);

      await svc.provisionRealmRoles('acme');

      expect(svc.kcClient.roles.create).toHaveBeenCalledTimes(2);
      const names = vi
        .mocked(svc.kcClient.roles.create)
        .mock.calls.map((c) => (c[0] as { name: string }).name);
      expect(names).toContain('tenant_admin');
      expect(names).toContain('user');
    });

    it('should skip creation when roles already exist', async () => {
      vi.mocked(svc.kcClient.roles.findOneByName).mockResolvedValue({
        name: 'tenant_admin',
      } as never);

      await svc.provisionRealmRoles('acme');

      expect(svc.kcClient.roles.create).not.toHaveBeenCalled();
    });

    it('should throw KeycloakSanitizedError on role provisioning failure', async () => {
      // findOneByName is swallowed by ensureRoleExists; roles.create must also fail
      // so the outer catch in provisionRealmRoles fires and calls sanitizeKeycloakError
      vi.mocked(svc.kcClient.roles.findOneByName).mockRejectedValue(new Error('find failed'));
      vi.mocked(svc.kcClient.roles.create).mockRejectedValue(
        Object.assign(new Error('server error'), { response: { status: 500, data: 'error' } })
      );

      await expect(svc.provisionRealmRoles('acme')).rejects.toBeInstanceOf(KeycloakSanitizedError);
    });
  });

  // ── setRealmEnabled ───────────────────────────────────────────────────────

  describe('setRealmEnabled()', () => {
    it('should throw on invalid realm name', async () => {
      await expect(svc.setRealmEnabled('BAD REALM', true)).rejects.toThrow(
        'Invalid realm name format'
      );
    });

    it('should enable realm when it exists', async () => {
      vi.mocked(svc.kcClient.realms.findOne).mockResolvedValue({ realm: 'acme' } as never);
      vi.mocked(svc.kcClient.realms.update).mockResolvedValue(undefined);

      await svc.setRealmEnabled('acme', true);

      expect(svc.kcClient.realms.update).toHaveBeenCalledWith({ realm: 'acme' }, { enabled: true });
    });

    it('should disable realm when it exists', async () => {
      vi.mocked(svc.kcClient.realms.findOne).mockResolvedValue({ realm: 'acme' } as never);
      vi.mocked(svc.kcClient.realms.update).mockResolvedValue(undefined);

      await svc.setRealmEnabled('acme', false);

      expect(svc.kcClient.realms.update).toHaveBeenCalledWith(
        { realm: 'acme' },
        { enabled: false }
      );
    });

    it('should throw "not found" error when realm does not exist', async () => {
      const notFound = Object.assign(new Error('not found'), { response: { status: 404 } });
      vi.mocked(svc.kcClient.realms.findOne).mockRejectedValue(notFound);

      await expect(svc.setRealmEnabled('acme', true)).rejects.toThrow("Realm 'acme' not found");
    });

    it('should throw KeycloakSanitizedError on update failure', async () => {
      vi.mocked(svc.kcClient.realms.findOne).mockResolvedValue({ realm: 'acme' } as never);
      vi.mocked(svc.kcClient.realms.update).mockRejectedValue(
        Object.assign(new Error('forbidden'), { response: { status: 403, data: 'forbidden' } })
      );

      await expect(svc.setRealmEnabled('acme', true)).rejects.toBeInstanceOf(
        KeycloakSanitizedError
      );
    });
  });

  // ── configureRefreshTokenRotation ─────────────────────────────────────────

  describe('configureRefreshTokenRotation()', () => {
    it('should throw on invalid realm name', async () => {
      await expect(svc.configureRefreshTokenRotation('BAD!')).rejects.toThrow(
        'Invalid realm name format'
      );
    });

    it('should update realm with revokeRefreshToken=true', async () => {
      vi.mocked(svc.kcClient.realms.update).mockResolvedValue(undefined);

      await svc.configureRefreshTokenRotation('acme');

      expect(svc.kcClient.realms.update).toHaveBeenCalledWith(
        { realm: 'acme' },
        { revokeRefreshToken: true, refreshTokenMaxReuse: 0 }
      );
    });

    it('should throw KeycloakSanitizedError on update failure', async () => {
      vi.mocked(svc.kcClient.realms.update).mockRejectedValue(
        Object.assign(new Error('server error'), { response: { status: 500, data: 'error' } })
      );

      await expect(svc.configureRefreshTokenRotation('acme')).rejects.toBeInstanceOf(
        KeycloakSanitizedError
      );
    });
  });

  // ── exchangeAuthorizationCode ─────────────────────────────────────────────

  describe('exchangeAuthorizationCode()', () => {
    it('should throw on invalid realm name', async () => {
      await expect(
        svc.exchangeAuthorizationCode('INVALID!', 'code', 'http://localhost/cb')
      ).rejects.toThrow('Invalid realm name format');
    });

    it('should POST to token endpoint and return token response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse(MOCK_TOKEN_RESPONSE)));

      const result = await svc.exchangeAuthorizationCode(
        'acme',
        'my-auth-code',
        'http://localhost:3001/auth/callback'
      );

      expect(result).toEqual(MOCK_TOKEN_RESPONSE);

      const [url, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toBe('http://localhost:8080/realms/acme/protocol/openid-connect/token');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe(
        'application/x-www-form-urlencoded'
      );

      const body = new URLSearchParams(init.body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('my-auth-code');
      expect(body.get('redirect_uri')).toBe('http://localhost:3001/auth/callback');
      expect(body.get('client_id')).toBe('plexica-web');
    });

    it('should include code_verifier when provided (PKCE)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse(MOCK_TOKEN_RESPONSE)));

      await svc.exchangeAuthorizationCode(
        'acme',
        'code',
        'http://localhost/cb',
        'plexica-web',
        'my-verifier'
      );

      const [, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      const body = new URLSearchParams(init.body as string);
      expect(body.get('code_verifier')).toBe('my-verifier');
    });

    it('should throw KeycloakSanitizedError on 400 response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(makeErrorFetchResponse(400, 'invalid_grant'))
      );

      await expect(
        svc.exchangeAuthorizationCode('acme', 'bad-code', 'http://localhost/cb')
      ).rejects.toBeInstanceOf(KeycloakSanitizedError);
    });

    it('should throw KeycloakSanitizedError on 401 response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(makeErrorFetchResponse(401, 'unauthorized'))
      );

      await expect(
        svc.exchangeAuthorizationCode('acme', 'code', 'http://localhost/cb')
      ).rejects.toBeInstanceOf(KeycloakSanitizedError);
    });

    it('should throw generic error on fetch network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));

      await expect(
        svc.exchangeAuthorizationCode('acme', 'code', 'http://localhost/cb')
      ).rejects.toThrow('Failed to exchange authorization code due to network or server error');
    });
  });

  // ── refreshToken ──────────────────────────────────────────────────────────

  describe('refreshToken()', () => {
    it('should throw on invalid realm name', async () => {
      await expect(svc.refreshToken('INVALID!', 'rt')).rejects.toThrow('Invalid realm name format');
    });

    it('should POST refresh_token grant and return token response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse(MOCK_TOKEN_RESPONSE)));

      const result = await svc.refreshToken('acme', 'my-refresh-token');

      expect(result).toEqual(MOCK_TOKEN_RESPONSE);

      const [url, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toContain('/realms/acme/protocol/openid-connect/token');
      const body = new URLSearchParams(init.body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('my-refresh-token');
      expect(body.get('client_id')).toBe('plexica-web');
    });

    it('should throw KeycloakSanitizedError on 401 response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(makeErrorFetchResponse(401, 'session expired'))
      );

      await expect(svc.refreshToken('acme', 'stale-token')).rejects.toBeInstanceOf(
        KeycloakSanitizedError
      );
    });

    it('should throw generic error on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      await expect(svc.refreshToken('acme', 'token')).rejects.toThrow(
        'Failed to refresh token due to network or server error'
      );
    });
  });

  // ── revokeToken ───────────────────────────────────────────────────────────

  describe('revokeToken()', () => {
    it('should throw on invalid realm name', async () => {
      await expect(svc.revokeToken('INVALID!', 'token')).rejects.toThrow(
        'Invalid realm name format'
      );
    });

    it('should POST to revocation endpoint', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, text: vi.fn(), json: vi.fn() })
      );

      await svc.revokeToken('acme', 'my-token');

      const [url, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toContain('/realms/acme/protocol/openid-connect/revoke');
      const body = new URLSearchParams(init.body as string);
      expect(body.get('token')).toBe('my-token');
      expect(body.get('client_id')).toBe('plexica-web');
    });

    it('should include token_type_hint when provided', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, text: vi.fn(), json: vi.fn() })
      );

      await svc.revokeToken('acme', 'my-token', 'refresh_token');

      const [, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      const body = new URLSearchParams(init.body as string);
      expect(body.get('token_type_hint')).toBe('refresh_token');
    });

    it('should throw KeycloakSanitizedError on 400 response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(makeErrorFetchResponse(400, 'invalid_token'))
      );

      await expect(svc.revokeToken('acme', 'bad-token')).rejects.toBeInstanceOf(
        KeycloakSanitizedError
      );
    });

    it('should throw generic error on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

      await expect(svc.revokeToken('acme', 'token')).rejects.toThrow(
        'Failed to revoke token due to network or server error'
      );
    });
  });

  // ── deleteRealm ───────────────────────────────────────────────────────────

  describe('deleteRealm()', () => {
    it('should call client.realms.del with the tenant slug', async () => {
      vi.mocked(svc.kcClient.realms.del).mockResolvedValue(undefined);

      await svc.deleteRealm('acme');

      expect(svc.kcClient.realms.del).toHaveBeenCalledWith({ realm: 'acme' });
    });
  });

  // ── updateRealm ───────────────────────────────────────────────────────────

  describe('updateRealm()', () => {
    it('should call client.realms.update with the provided updates', async () => {
      vi.mocked(svc.kcClient.realms.update).mockResolvedValue(undefined);

      await svc.updateRealm('acme', { displayName: 'New Name' });

      expect(svc.kcClient.realms.update).toHaveBeenCalledWith(
        { realm: 'acme' },
        { displayName: 'New Name' }
      );
    });
  });

  // ── createUser ────────────────────────────────────────────────────────────

  describe('createUser()', () => {
    it('should create a user and return the id', async () => {
      vi.mocked(svc.kcClient.users.create).mockResolvedValue({ id: 'user-123' } as never);

      const result = await svc.createUser('acme', {
        username: 'jdoe',
        email: 'jdoe@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result).toEqual({ id: 'user-123' });
      expect(svc.kcClient.users.create).toHaveBeenCalledOnce();
    });
  });

  // ── getUser ───────────────────────────────────────────────────────────────

  describe('getUser()', () => {
    it('should return user representation when found', async () => {
      const user = { id: 'user-123', username: 'jdoe' };
      vi.mocked(svc.kcClient.users.findOne).mockResolvedValue(user as never);

      const result = await svc.getUser('acme', 'user-123');
      expect(result).toEqual(user);
    });

    it('should return undefined on 404', async () => {
      const notFound = Object.assign(new Error('not found'), { response: { status: 404 } });
      vi.mocked(svc.kcClient.users.findOne).mockRejectedValue(notFound);

      const result = await svc.getUser('acme', 'missing-user');
      expect(result).toBeUndefined();
    });
  });

  // ── listUsers ─────────────────────────────────────────────────────────────

  describe('listUsers()', () => {
    it('should return list of users', async () => {
      const users = [{ id: 'u1' }, { id: 'u2' }];
      vi.mocked(svc.kcClient.users.find).mockResolvedValue(users as never);

      const result = await svc.listUsers('acme');
      expect(result).toEqual(users);
    });
  });

  // ── deleteUser ────────────────────────────────────────────────────────────

  describe('deleteUser()', () => {
    it('should call client.users.del with the user id', async () => {
      vi.mocked(svc.kcClient.users.del).mockResolvedValue(undefined);

      await svc.deleteUser('acme', 'user-123');

      expect(svc.kcClient.users.del).toHaveBeenCalledWith({ id: 'user-123' });
    });
  });

  // ── setUserPassword ───────────────────────────────────────────────────────

  describe('setUserPassword()', () => {
    it('should call resetPassword with the provided credentials', async () => {
      vi.mocked(svc.kcClient.users.resetPassword).mockResolvedValue(undefined);

      await svc.setUserPassword('acme', 'user-123', 'secret123');

      expect(svc.kcClient.users.resetPassword).toHaveBeenCalledWith({
        id: 'user-123',
        credential: { temporary: false, type: 'password', value: 'secret123' },
      });
    });

    it('should set temporary=true when requested', async () => {
      vi.mocked(svc.kcClient.users.resetPassword).mockResolvedValue(undefined);

      await svc.setUserPassword('acme', 'user-123', 'tempPass', true);

      const [call] = vi.mocked(svc.kcClient.users.resetPassword).mock.calls;
      expect((call[0] as { credential: { temporary: boolean } }).credential.temporary).toBe(true);
    });
  });

  // ── assignRealmRoleToUser ─────────────────────────────────────────────────

  describe('assignRealmRoleToUser()', () => {
    it('should find the role and assign it to the user', async () => {
      vi.mocked(svc.kcClient.roles.find).mockResolvedValue([
        { id: 'role-id-1', name: 'tenant_admin' },
      ] as never);
      vi.mocked(svc.kcClient.users.addRealmRoleMappings).mockResolvedValue(undefined);

      await svc.assignRealmRoleToUser('acme', 'user-123', 'tenant_admin');

      expect(svc.kcClient.users.addRealmRoleMappings).toHaveBeenCalledWith({
        id: 'user-123',
        roles: [{ id: 'role-id-1', name: 'tenant_admin' }],
      });
    });

    it('should throw when role is not found', async () => {
      vi.mocked(svc.kcClient.roles.find).mockResolvedValue([] as never);

      await expect(svc.assignRealmRoleToUser('acme', 'user-123', 'unknown_role')).rejects.toThrow(
        "Role 'unknown_role' not found"
      );
    });
  });

  // ── sendRequiredActionEmail ───────────────────────────────────────────────

  describe('sendRequiredActionEmail()', () => {
    it('should call executeActionsEmail with provided actions', async () => {
      vi.mocked(svc.kcClient.users.executeActionsEmail).mockResolvedValue(undefined);

      await svc.sendRequiredActionEmail('acme', 'user-123', ['UPDATE_PASSWORD']);

      expect(svc.kcClient.users.executeActionsEmail).toHaveBeenCalledWith({
        id: 'user-123',
        actions: ['UPDATE_PASSWORD'],
        lifespan: 86400,
      });
    });
  });

  // ── healthCheck ───────────────────────────────────────────────────────────

  describe('healthCheck()', () => {
    it('should return true when Keycloak is reachable', async () => {
      vi.mocked(svc.kcClient.realms.findOne).mockResolvedValue({ realm: 'master' } as never);

      expect(await svc.healthCheck()).toBe(true);
    });

    it('should return false when Keycloak throws', async () => {
      vi.mocked(svc.kcClient.realms.findOne).mockRejectedValue(new Error('connection refused'));

      expect(await svc.healthCheck()).toBe(false);
    });
  });
});
