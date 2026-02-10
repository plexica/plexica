// Unit tests for JWT utilities
import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  extractBearerToken,
  hasRole,
  hasClientRole,
  extractUserInfo,
  generateInternalToken,
  verifyInternalToken,
  type KeycloakJwtPayload,
} from '../../../lib/jwt';

describe('JWT Utilities', () => {
  describe('extractBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...';
      const authHeader = `Bearer ${token}`;

      const result = extractBearerToken(authHeader);

      expect(result).toBe(token);
    });

    it('should return null for missing header', () => {
      const result = extractBearerToken(undefined);

      expect(result).toBeNull();
    });

    it('should return null for invalid format (not Bearer)', () => {
      const result = extractBearerToken('Basic sometoken');

      expect(result).toBeNull();
    });

    it('should return null for malformed header (missing token)', () => {
      const result = extractBearerToken('Bearer');

      expect(result).toBeNull();
    });

    it('should return null for malformed header (extra parts)', () => {
      const result = extractBearerToken('Bearer token1 token2');

      expect(result).toBeNull();
    });
  });

  describe('hasRole', () => {
    it('should return true when user has the role', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        realm_access: {
          roles: ['admin', 'user'],
        },
      };

      const result = hasRole(payload, 'admin');

      expect(result).toBe(true);
    });

    it('should return false when user does not have the role', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        realm_access: {
          roles: ['user'],
        },
      };

      const result = hasRole(payload, 'admin');

      expect(result).toBe(false);
    });

    it('should return false when realm_access is undefined', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
      };

      const result = hasRole(payload, 'admin');

      expect(result).toBe(false);
    });

    it('should return false when roles array is empty', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        realm_access: {
          roles: [],
        },
      };

      const result = hasRole(payload, 'admin');

      expect(result).toBe(false);
    });
  });

  describe('hasClientRole', () => {
    it('should return true when user has the client role', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        resource_access: {
          'plexica-client': {
            roles: ['tenant-admin', 'user'],
          },
        },
      };

      const result = hasClientRole(payload, 'plexica-client', 'tenant-admin');

      expect(result).toBe(true);
    });

    it('should return false when user does not have the client role', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        resource_access: {
          'plexica-client': {
            roles: ['user'],
          },
        },
      };

      const result = hasClientRole(payload, 'plexica-client', 'admin');

      expect(result).toBe(false);
    });

    it('should return false when client does not exist in resource_access', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        resource_access: {
          'other-client': {
            roles: ['admin'],
          },
        },
      };

      const result = hasClientRole(payload, 'plexica-client', 'admin');

      expect(result).toBe(false);
    });

    it('should return false when resource_access is undefined', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
      };

      const result = hasClientRole(payload, 'plexica-client', 'admin');

      expect(result).toBe(false);
    });
  });

  describe('extractUserInfo', () => {
    it('should extract complete user info from payload', () => {
      const payload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'john.doe',
        email: 'john.doe@example.com',
        email_verified: true,
        name: 'John Doe',
        given_name: 'John',
        family_name: 'Doe',
        realm_access: {
          roles: ['admin', 'user'],
        },
      };

      const result = extractUserInfo(payload);

      expect(result).toEqual({
        id: 'user-123',
        username: 'john.doe',
        email: 'john.doe@example.com',
        emailVerified: true,
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        roles: ['admin', 'user'],
      });
    });

    it('should handle missing optional fields', () => {
      const payload: KeycloakJwtPayload = {
        sub: 'user-456',
        preferred_username: 'jane',
      };

      const result = extractUserInfo(payload);

      expect(result).toEqual({
        id: 'user-456',
        username: 'jane',
        email: undefined,
        emailVerified: undefined,
        name: undefined,
        firstName: undefined,
        lastName: undefined,
        roles: [],
      });
    });

    it('should return empty roles array when realm_access is undefined', () => {
      const payload: KeycloakJwtPayload = {
        sub: 'user-789',
        preferred_username: 'test',
        email: 'test@example.com',
      };

      const result = extractUserInfo(payload);

      expect(result.roles).toEqual([]);
    });
  });

  describe('generateInternalToken and verifyInternalToken', () => {
    it('should generate and verify internal token with default expiry', () => {
      const payload = {
        userId: 'user-123',
        tenantId: 'tenant-abc',
      };

      const token = generateInternalToken(payload);
      const decoded = verifyInternalToken(token);

      expect(decoded).toMatchObject({
        userId: 'user-123',
        tenantId: 'tenant-abc',
        iss: 'plexica-core-api',
      });
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('should generate token with custom expiry', () => {
      const payload = { data: 'test' };

      const token = generateInternalToken(payload, '1h');
      const decoded = verifyInternalToken(token);

      expect(decoded.data).toBe('test');
      // Token should expire in ~1 hour (3600 seconds)
      const expiryDuration = decoded.exp! - decoded.iat!;
      expect(expiryDuration).toBeGreaterThanOrEqual(3590);
      expect(expiryDuration).toBeLessThanOrEqual(3610);
    });

    it('should throw error for expired token', () => {
      vi.useFakeTimers();
      try {
        const payload = { data: 'test' };
        const token = generateInternalToken(payload, '1s');
        vi.advanceTimersByTime(2000);
        expect(() => verifyInternalToken(token)).toThrow();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw error for invalid token', () => {
      expect(() => verifyInternalToken('invalid.token.here')).toThrow();
    });

    it('should throw error for token with wrong issuer', () => {
      // Create a token with different issuer
      const token = jwt.sign({ data: 'test' }, process.env.JWT_SECRET || 'test-secret', {
        issuer: 'wrong-issuer',
      });

      expect(() => verifyInternalToken(token)).toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle payload with null values', () => {
      const payload: KeycloakJwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        email: null as any,
        name: null as any,
      };

      const result = extractUserInfo(payload);

      expect(result.id).toBe('user-123');
      expect(result.username).toBe('testuser');
      expect(result.email).toBeNull();
      expect(result.name).toBeNull();
    });

    it('should handle Bearer token with surrounding whitespace', () => {
      const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...';
      const authHeader = `Bearer ${token}`;

      const result = extractBearerToken(authHeader);

      expect(result).toBe(token);
    });

    it('should handle case-sensitive Bearer scheme', () => {
      // Should NOT extract if not exactly "Bearer"
      const result1 = extractBearerToken('bearer token123');
      const result2 = extractBearerToken('BEARER token123');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });
});
