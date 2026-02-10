// Comprehensive tests for Keycloak JWT functions
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  verifyKeycloakToken,
  verifyTokenWithTenant,
  type KeycloakJwtPayload,
} from '../../../lib/jwt.js';

// Mock jwks-rsa to prevent real network calls to Keycloak JWKS endpoint
const mockGetSigningKey = vi.fn();
vi.mock('jwks-rsa', () => {
  return {
    default: vi.fn(() => ({
      getSigningKey: mockGetSigningKey,
    })),
  };
});

// Mock config
vi.mock('../../../config/index.js', () => ({
  config: {
    jwtSecret: 'test-secret',
    keycloakUrl: 'http://localhost:8080',
  },
}));

describe('Keycloak JWT Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getSigningKey resolves with a valid key
    mockGetSigningKey.mockImplementation(
      (_kid: string, cb: (err: Error | null, key?: { getPublicKey: () => string }) => void) => {
        cb(null, { getPublicKey: () => 'test-public-key' });
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('verifyKeycloakToken', () => {
    it('should verify valid Keycloak token', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/realms/master',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { kid: 'test-key-id', alg: 'RS256' },
        payload: mockPayload,
      } as any);

      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';
      const result = await verifyKeycloakToken(token, 'master');

      expect(result.sub).toBe('user-123');
      expect(result.preferred_username).toBe('testuser');
      expect(jwt.decode).toHaveBeenCalledWith(token, { complete: true });
      expect(jwt.verify).toHaveBeenCalledWith(token, 'test-public-key', {
        algorithms: ['RS256'],
        issuer: 'http://localhost:8080/realms/master',
      });
      expect(mockGetSigningKey).toHaveBeenCalledWith('test-key-id', expect.any(Function));
    });

    it('should throw error when token lacks kid header', async () => {
      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: {},
        payload: {},
      } as any);

      const token = 'invalid.jwt.token';

      await expect(verifyKeycloakToken(token, 'master')).rejects.toThrow(
        'Invalid token: missing kid in header'
      );
    });

    it('should throw error when decoding returns null', async () => {
      vi.spyOn(jwt, 'decode').mockReturnValue(null);

      const token = 'invalid.jwt.token';

      await expect(verifyKeycloakToken(token, 'master')).rejects.toThrow(
        'Invalid token: missing kid in header'
      );
    });

    it('should handle network errors gracefully', async () => {
      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { kid: 'test-key-id', alg: 'RS256' },
        payload: { sub: 'user-123' },
      } as any);

      // Simulate JWKS network error
      mockGetSigningKey.mockImplementation(
        (_kid: string, cb: (err: Error | null, key?: any) => void) => {
          cb(new Error('connect ECONNREFUSED 127.0.0.1:8080'));
        }
      );

      const token = 'valid.jwt.token';

      await expect(verifyKeycloakToken(token, 'master')).rejects.toThrow(
        'connect ECONNREFUSED 127.0.0.1:8080'
      );
    });

    it('should use custom realm parameter', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/realms/custom',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { kid: 'test-key-id', alg: 'RS256' },
        payload: mockPayload,
      } as any);

      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';
      await verifyKeycloakToken(token, 'custom');

      // Verify that custom realm is used in issuer check
      const verifyCall = vi.mocked(jwt.verify).mock.calls[0];
      expect(verifyCall[2]?.issuer).toBe('http://localhost:8080/realms/custom');
    });
  });

  describe('verifyTokenWithTenant', () => {
    it('should extract tenant from custom claim', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        tenant: 'tenant-slug',
        iss: 'http://localhost:8080/realms/custom-realm',
      };

      // verifyTokenWithTenant calls jwt.decode(token, { complete: true })
      // which needs to return { header, payload } for the alg check
      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { alg: 'RS256', kid: 'test-key-id' },
        payload: mockPayload,
      } as any);

      // verifyKeycloakToken (RS256 path) will call jwt.verify
      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';
      const result = await verifyTokenWithTenant(token);

      expect(result.tenantSlug).toBe('tenant-slug');
      expect(result.sub).toBe('user-123');
    });

    it('should extract tenant from issuer when custom claim missing', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/realms/tenant-name',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { alg: 'RS256', kid: 'test-key-id' },
        payload: mockPayload,
      } as any);

      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';
      const result = await verifyTokenWithTenant(token);

      expect(result.tenantSlug).toBe('tenant-name');
    });

    it('should default to master realm when tenant info missing', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { alg: 'RS256', kid: 'test-key-id' },
        payload: mockPayload,
      } as any);

      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';
      const result = await verifyTokenWithTenant(token);

      expect(result.tenantSlug).toBe('master');
    });

    it('should throw error when unable to decode token', async () => {
      vi.spyOn(jwt, 'decode').mockReturnValue(null);

      const token = 'invalid.jwt.token';

      await expect(verifyTokenWithTenant(token)).rejects.toThrow('Invalid token');
    });

    it('should preserve all payload fields when verifying with tenant', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        email: 'test@example.com',
        email_verified: true,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        realm_access: { roles: ['admin', 'user'] },
        resource_access: {
          'client-1': { roles: ['manage-account'] },
        },
        tenant: 'test-tenant',
        iss: 'http://localhost:8080/realms/test-realm',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { alg: 'RS256', kid: 'test-key-id' },
        payload: mockPayload,
      } as any);

      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';
      const result = await verifyTokenWithTenant(token);

      expect(result.email).toBe('test@example.com');
      expect(result.email_verified).toBe(true);
      expect(result.name).toBe('Test User');
      expect(result.realm_access?.roles).toEqual(['admin', 'user']);
      expect(result.tenantSlug).toBe('test-tenant');
    });

    it('should handle invalid issuer format', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/invalid-format',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { alg: 'RS256', kid: 'test-key-id' },
        payload: mockPayload,
      } as any);

      // When issuer doesn't match /realms/xxx, tenantSlug defaults to 'master',
      // so verifyKeycloakToken is called with realm='master'
      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';
      const result = await verifyTokenWithTenant(token);

      // If issuer doesn't match /realms/realm format, should default to master
      expect(result.tenantSlug).toBe('master');
    });

    it('should handle issuer with trailing slash', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/realms/test-realm/',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { alg: 'RS256', kid: 'test-key-id' },
        payload: mockPayload,
      } as any);

      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';
      const result = await verifyTokenWithTenant(token);

      // Trailing slash causes regex /\/realms\/([^/]+)$/ to not match,
      // so tenantSlug defaults to 'master'
      expect(result.tenantSlug).toBe('master');
    });

    it('should handle multiple realms in issuer path', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/realms/parent/realms/child',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { alg: 'RS256', kid: 'test-key-id' },
        payload: mockPayload,
      } as any);

      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';
      const result = await verifyTokenWithTenant(token);

      // Should match the last /realms/xxx pattern
      expect(result.tenantSlug).toBe('child');
    });

    it('should prefer custom tenant claim over issuer', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        tenant: 'custom-tenant',
        iss: 'http://localhost:8080/realms/issuer-tenant',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { alg: 'RS256', kid: 'test-key-id' },
        payload: mockPayload,
      } as any);

      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';
      const result = await verifyTokenWithTenant(token);

      expect(result.tenantSlug).toBe('custom-tenant');
    });
  });
});
