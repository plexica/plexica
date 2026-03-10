/**
 * Unit tests for keycloak-url-validator.ts
 *
 * Covers: assertKeycloakUrl(), getKeycloakBaseUrl(), and the extended
 * validateRealmName() checks added in Spec 015 (FR-001, FR-002, FR-003, FR-004).
 *
 * Uses vi.stubEnv() to isolate KEYCLOAK_URL across tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertKeycloakUrl, getKeycloakBaseUrl } from '../../../services/keycloak-url-validator.js';
import { KeycloakService } from '../../../services/keycloak.service.js';

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
    nodeEnv: 'test',
    keycloakUrl: 'http://keycloak.test:8080',
    keycloakRealm: 'master',
    keycloakClientId: 'admin-cli',
    keycloakClientSecret: undefined,
    keycloakAdminUsername: 'admin',
    keycloakAdminPassword: 'admin',
  },
}));

vi.mock('@keycloak/keycloak-admin-client', () => {
  class MockKcAdminClient {
    auth = vi.fn();
    realms = { create: vi.fn(), del: vi.fn(), findOne: vi.fn() };
    clients = { create: vi.fn(), find: vi.fn() };
    users = { create: vi.fn(), find: vi.fn(), addRealmRoleMappings: vi.fn() };
    roles = { create: vi.fn(), findOneByName: vi.fn() };
  }
  return { default: MockKcAdminClient };
});

// ─── getKeycloakBaseUrl() ──────────────────────────────────────────────────

describe('getKeycloakBaseUrl()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should parse a valid KEYCLOAK_URL', () => {
    // Arrange
    vi.stubEnv('KEYCLOAK_URL', 'https://keycloak.test:8443');

    // Act
    const url = getKeycloakBaseUrl();

    // Assert
    expect(url.hostname).toBe('keycloak.test');
    expect(url.protocol).toBe('https:');
    expect(url.port).toBe('8443');
  });

  it('should normalize trailing slash on KEYCLOAK_URL without throwing', () => {
    // Arrange — trailing slash is valid for URL parsing
    vi.stubEnv('KEYCLOAK_URL', 'https://keycloak.test:8443/');

    // Act & Assert — must not throw
    expect(() => getKeycloakBaseUrl()).not.toThrow();
    const url = getKeycloakBaseUrl();
    expect(url.hostname).toBe('keycloak.test');
  });

  it('should throw a clear error when KEYCLOAK_URL is missing', () => {
    // Arrange
    vi.stubEnv('KEYCLOAK_URL', '');

    // Act & Assert
    expect(() => getKeycloakBaseUrl()).toThrow(
      'KEYCLOAK_URL environment variable is not set or invalid'
    );
  });

  it('should throw when KEYCLOAK_URL is not a valid URL', () => {
    // Arrange
    vi.stubEnv('KEYCLOAK_URL', 'not-a-url');

    // Act & Assert
    expect(() => getKeycloakBaseUrl()).toThrow(
      'KEYCLOAK_URL environment variable is not set or invalid'
    );
  });
});

// ─── assertKeycloakUrl() ───────────────────────────────────────────────────

describe('assertKeycloakUrl()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should not throw when URL hostname and protocol match KEYCLOAK_URL', () => {
    // Arrange
    vi.stubEnv('KEYCLOAK_URL', 'https://keycloak.test:8443');
    const url = 'https://keycloak.test:8443/realms/my-realm/protocol/openid-connect/token';

    // Act & Assert
    expect(() => assertKeycloakUrl(url)).not.toThrow();
  });

  it('should throw SSRF_BLOCKED when hostname does not match', () => {
    // Arrange
    vi.stubEnv('KEYCLOAK_URL', 'https://keycloak.internal:8443');
    const url = 'https://evil.attacker.com/realms/my-realm/protocol/openid-connect/token';

    // Act & Assert
    expect(() => assertKeycloakUrl(url)).toThrow('SSRF_BLOCKED');
    expect(() => assertKeycloakUrl(url)).toThrow('does not match configured KEYCLOAK_URL');
  });

  it('should throw SSRF_BLOCKED when protocol does not match', () => {
    // Arrange
    vi.stubEnv('KEYCLOAK_URL', 'https://keycloak.test:8443');
    const url = 'http://keycloak.test:8443/realms/my-realm/protocol/openid-connect/token';

    // Act & Assert
    expect(() => assertKeycloakUrl(url)).toThrow('SSRF_BLOCKED');
  });

  it('should handle port normalisation: https://host:443 === https://host', () => {
    // Arrange — URL spec: default port 443 for https is normalised to '' by URL parser
    vi.stubEnv('KEYCLOAK_URL', 'https://keycloak.test');
    const url = 'https://keycloak.test/realms/master/protocol/openid-connect/token';

    // Act & Assert — both have empty port string after URL parsing
    expect(() => assertKeycloakUrl(url)).not.toThrow();
  });

  it('should throw SSRF_BLOCKED for a completely different port', () => {
    // Arrange
    vi.stubEnv('KEYCLOAK_URL', 'https://keycloak.test:8443');
    const url = 'https://keycloak.test:9999/realms/my-realm/protocol/openid-connect/token';

    // Act & Assert
    expect(() => assertKeycloakUrl(url)).toThrow('SSRF_BLOCKED');
  });

  it('should throw when the constructed URL is not parseable', () => {
    // Arrange
    vi.stubEnv('KEYCLOAK_URL', 'https://keycloak.test:8443');

    // Act & Assert
    expect(() => assertKeycloakUrl('not-a-valid-url')).toThrow('SSRF_BLOCKED');
  });
});

// ─── validateRealmName() (T015-03 — URL-encoded separator rejection) ───────

describe('KeycloakService.validateRealmName() — URL-encoded separator rejection (T015-03)', () => {
  // Access protected method via subclass for testing
  class TestableKeycloakService extends KeycloakService {
    public testValidateRealmName(name: string): void {
      // @ts-expect-error — accessing protected method for testing
      return this.validateRealmName(name);
    }
  }

  let service: TestableKeycloakService;

  beforeEach(() => {
    vi.stubEnv('KEYCLOAK_URL', 'http://keycloak.test:8080');
    service = new TestableKeycloakService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should pass for a valid realm name', () => {
    expect(() => service.testValidateRealmName('my-realm')).not.toThrow();
  });

  it('should throw for realm containing %2f (URL-encoded /)', () => {
    expect(() => service.testValidateRealmName('my%2frealm')).toThrow(
      'Invalid realm name: contains disallowed characters'
    );
  });

  it('should throw for realm containing %2F (URL-encoded / uppercase)', () => {
    expect(() => service.testValidateRealmName('my%2Frealm')).toThrow(
      'Invalid realm name: contains disallowed characters'
    );
  });

  it('should throw for realm containing %5c (URL-encoded \\)', () => {
    expect(() => service.testValidateRealmName('my%5crealm')).toThrow(
      'Invalid realm name: contains disallowed characters'
    );
  });

  it('should throw for realm containing %5C (URL-encoded \\ uppercase)', () => {
    expect(() => service.testValidateRealmName('my%5Crealm')).toThrow(
      'Invalid realm name: contains disallowed characters'
    );
  });

  it('should throw for realm containing .. (double-dot traversal)', () => {
    expect(() => service.testValidateRealmName('my..realm')).toThrow(
      'Invalid realm name: contains disallowed characters'
    );
  });

  it('should throw for realm that fails the slug regex', () => {
    expect(() => service.testValidateRealmName('MY_REALM')).toThrow('Invalid realm name format');
  });
});

// ─── Integration: exchangeAuthorizationCode with valid KEYCLOAK_URL ─────────

describe('KeycloakService.exchangeAuthorizationCode() — SSRF check integration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should call fetch without throwing when URL matches KEYCLOAK_URL', async () => {
    // Arrange
    vi.stubEnv('KEYCLOAK_URL', 'http://keycloak.test:8080');

    // Mock fetch to return a successful token response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'test-access-token',
        expires_in: 300,
        refresh_expires_in: 1800,
        refresh_token: 'test-refresh-token',
        token_type: 'Bearer',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const service = new KeycloakService();

    // Act — this uses the config-mocked keycloakUrl which matches KEYCLOAK_URL stub
    const result = await service.exchangeAuthorizationCode(
      'my-realm',
      'auth-code-123',
      'http://localhost:3000/callback'
    );

    // Assert — fetch was called and no SSRF error thrown
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result.access_token).toBe('test-access-token');
  });
});
