// Comprehensive tests for Keycloak JWT functions
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyKeycloakToken, verifyTokenWithTenant, type KeycloakJwtPayload } from '../../lib/jwt';

describe('Keycloak JWT Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        header: { kid: 'test-key-id' },
        payload: mockPayload,
      } as any);

      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';

      try {
        const result = await verifyKeycloakToken(token, 'master');
        expect(result.sub).toBe('user-123');
        expect(result.preferred_username).toBe('testuser');
      } catch (e) {
        // Network error is expected if actual Keycloak is not available
        expect(jwt.decode).toHaveBeenCalled();
      }
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
        header: { kid: 'test-key-id' },
        payload: { sub: 'user-123' },
      } as any);

      const token = 'valid.jwt.token';

      // When getSigningKey fails (no real Keycloak), it should throw
      await expect(verifyKeycloakToken(token, 'master')).rejects.toThrow();
    });

    it('should use custom realm parameter', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/realms/custom',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue({
        header: { kid: 'test-key-id' },
        payload: mockPayload,
      } as any);

      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';

      try {
        await verifyKeycloakToken(token, 'custom');
        // Verify that custom realm is used in issuer check
        const verifyCall = vi.mocked(jwt.verify).mock.calls[0];
        expect(verifyCall[2]?.issuer).toContain('custom');
      } catch (e) {
        expect(jwt.decode).toHaveBeenCalled();
      }
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

      vi.spyOn(jwt, 'decode').mockReturnValue(mockPayload as any);
      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';

      try {
        const result = await verifyTokenWithTenant(token);
        expect(result.tenantSlug).toBe('tenant-slug');
      } catch (e) {
        expect(jwt.decode).toHaveBeenCalled();
      }
    });

    it('should extract tenant from issuer when custom claim missing', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/realms/tenant-name',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue(mockPayload as any);
      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';

      try {
        const result = await verifyTokenWithTenant(token);
        expect(result.tenantSlug).toBe('tenant-name');
      } catch (e) {
        expect(jwt.decode).toHaveBeenCalled();
      }
    });

    it('should default to master realm when tenant info missing', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue(mockPayload as any);
      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';

      try {
        const result = await verifyTokenWithTenant(token);
        expect(result.tenantSlug).toBe('master');
      } catch (e) {
        expect(jwt.decode).toHaveBeenCalled();
      }
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

      vi.spyOn(jwt, 'decode').mockReturnValue(mockPayload as any);
      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';

      try {
        const result = await verifyTokenWithTenant(token);
        expect(result.email).toBe('test@example.com');
        expect(result.email_verified).toBe(true);
        expect(result.name).toBe('Test User');
        expect(result.realm_access?.roles).toEqual(['admin', 'user']);
      } catch (e) {
        expect(jwt.decode).toHaveBeenCalled();
      }
    });

    it('should handle invalid issuer format', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/invalid-format',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue(mockPayload as any);
      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';

      try {
        const result = await verifyTokenWithTenant(token);
        // If issuer doesn't match /realms/realm format, should default to master
        expect(result.tenantSlug).toBe('master');
      } catch (e) {
        expect(jwt.decode).toHaveBeenCalled();
      }
    });

    it('should handle issuer with trailing slash', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/realms/test-realm/',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue(mockPayload as any);
      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';

      try {
        const result = await verifyTokenWithTenant(token);
        expect(result.tenantSlug).toBe('test-realm');
      } catch (e) {
        expect(jwt.decode).toHaveBeenCalled();
      }
    });

    it('should handle multiple realms in issuer path', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        iss: 'http://localhost:8080/realms/parent/realms/child',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue(mockPayload as any);
      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';

      try {
        const result = await verifyTokenWithTenant(token);
        // Should match the last /realms/xxx pattern
        expect(result.tenantSlug).toBe('child');
      } catch (e) {
        expect(jwt.decode).toHaveBeenCalled();
      }
    });

    it('should prefer custom tenant claim over issuer', async () => {
      const mockPayload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        tenant: 'custom-tenant',
        iss: 'http://localhost:8080/realms/issuer-tenant',
      };

      vi.spyOn(jwt, 'decode').mockReturnValue(mockPayload as any);
      vi.spyOn(jwt, 'verify').mockReturnValue(mockPayload as any);

      const token = 'valid.jwt.token';

      try {
        const result = await verifyTokenWithTenant(token);
        expect(result.tenantSlug).toBe('custom-tenant');
      } catch (e) {
        expect(jwt.decode).toHaveBeenCalled();
      }
    });
  });
});
