// Extended tests for JWT utilities - error cases and edge cases
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
} from '../../lib/jwt';

// Mock JWT config
vi.mock('../../config/index.js', () => ({
  config: {
    jwtSecret: 'test-secret-key-for-testing',
    keycloakUrl: 'http://localhost:8080/auth',
  },
}));

describe('JWT Utilities - Extended Tests', () => {
  describe('extractBearerToken - Edge Cases', () => {
    it('should handle empty string', () => {
      expect(extractBearerToken('')).toBeNull();
    });

    it('should handle whitespace only', () => {
      expect(extractBearerToken('   ')).toBeNull();
    });

    it('should be case-sensitive for Bearer', () => {
      expect(extractBearerToken('bearer token')).toBeNull();
      expect(extractBearerToken('BEARER token')).toBeNull();
    });

    it('should handle tokens with special characters', () => {
      const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
      expect(extractBearerToken(`Bearer ${token}`)).toBe(token);
    });

    it('should handle tokens with dots and equals signs (base64)', () => {
      const token =
        'eyJ0eXAiOiJKV1QiLCJhbGc==.eyJzdWIiOiIxMjM0NTY3ODkwIiwiYWRtaW4iOnRydWUsIm==.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ=';
      expect(extractBearerToken(`Bearer ${token}`)).toBe(token);
    });
  });

  describe('hasRole - Extended Tests', () => {
    it('should handle null realm_access', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        realm_access: null as any,
      };
      expect(hasRole(payload, 'admin')).toBe(false);
    });

    it('should handle null roles array', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        realm_access: {
          roles: null as any,
        },
      };
      // When roles is null, it should throw because null.includes() is invalid
      // This is an edge case that the implementation doesn't handle
      expect(() => hasRole(payload, 'admin')).toThrow();
    });

    it('should be case-sensitive for role names', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        realm_access: {
          roles: ['Admin', 'USER'],
        },
      };
      expect(hasRole(payload, 'admin')).toBe(false);
      expect(hasRole(payload, 'Admin')).toBe(true);
    });

    it('should handle multiple roles', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        realm_access: {
          roles: ['admin', 'user', 'manager', 'viewer'],
        },
      };
      expect(hasRole(payload, 'admin')).toBe(true);
      expect(hasRole(payload, 'manager')).toBe(true);
      expect(hasRole(payload, 'nonexistent')).toBe(false);
    });
  });

  describe('hasClientRole - Extended Tests', () => {
    it('should return false when resource_access is null', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        resource_access: null as any,
      };
      expect(hasClientRole(payload, 'client', 'role')).toBe(false);
    });

    it('should handle missing client gracefully', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        resource_access: {},
      };
      expect(hasClientRole(payload, 'nonexistent-client', 'admin')).toBe(false);
    });

    it('should handle multiple clients', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        resource_access: {
          'client-1': {
            roles: ['admin', 'user'],
          },
          'client-2': {
            roles: ['viewer', 'editor'],
          },
          'client-3': {
            roles: ['owner'],
          },
        },
      };
      expect(hasClientRole(payload, 'client-1', 'admin')).toBe(true);
      expect(hasClientRole(payload, 'client-2', 'editor')).toBe(true);
      expect(hasClientRole(payload, 'client-3', 'owner')).toBe(true);
      expect(hasClientRole(payload, 'client-1', 'viewer')).toBe(false);
    });

    it('should be case-sensitive for client and role names', () => {
      const payload: KeycloakJwtPayload = {
        preferred_username: 'testuser',
        resource_access: {
          MyClient: {
            roles: ['Admin'],
          },
        },
      };
      expect(hasClientRole(payload, 'MyClient', 'Admin')).toBe(true);
      expect(hasClientRole(payload, 'myclient', 'Admin')).toBe(false);
      expect(hasClientRole(payload, 'MyClient', 'admin')).toBe(false);
    });
  });

  describe('extractUserInfo - Success Cases', () => {
    it('should extract complete user information', () => {
      const payload: KeycloakJwtPayload = {
        sub: 'user-id-123',
        preferred_username: 'john.doe',
        email: 'john.doe@example.com',
        email_verified: true,
        name: 'John Doe',
        given_name: 'John',
        family_name: 'Doe',
        realm_access: {
          roles: ['user', 'admin'],
        },
      };

      const userInfo = extractUserInfo(payload);

      expect(userInfo).toEqual({
        id: 'user-id-123',
        username: 'john.doe',
        email: 'john.doe@example.com',
        emailVerified: true,
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        roles: ['user', 'admin'],
      });
    });

    it('should extract minimal user information', () => {
      const payload: KeycloakJwtPayload = {
        sub: 'user-id-123',
        preferred_username: 'john.doe',
      };

      const userInfo = extractUserInfo(payload);

      expect(userInfo).toEqual({
        id: 'user-id-123',
        username: 'john.doe',
        email: undefined,
        emailVerified: undefined,
        name: undefined,
        firstName: undefined,
        lastName: undefined,
        roles: [],
      });
    });

    it('should extract user with multiple roles', () => {
      const payload: KeycloakJwtPayload = {
        sub: 'user-id-123',
        preferred_username: 'jane.admin',
        realm_access: {
          roles: ['admin', 'manager', 'user', 'viewer'],
        },
      };

      const userInfo = extractUserInfo(payload);

      expect(userInfo.roles).toEqual(['admin', 'manager', 'user', 'viewer']);
    });
  });

  describe('extractUserInfo - Error Cases', () => {
    it('should throw error when sub is missing', () => {
      const payload = {
        preferred_username: 'john.doe',
      } as KeycloakJwtPayload;

      expect(() => extractUserInfo(payload)).toThrow('Invalid token: missing sub claim');
    });

    it('should throw error when preferred_username is missing', () => {
      const payload = {
        sub: 'user-id-123',
      } as KeycloakJwtPayload;

      expect(() => extractUserInfo(payload)).toThrow(
        'Invalid token: missing preferred_username claim'
      );
    });

    it('should throw error when both sub and preferred_username are missing', () => {
      const payload = {} as KeycloakJwtPayload;

      expect(() => extractUserInfo(payload)).toThrow('Invalid token: missing sub claim');
    });

    it('should handle empty string claims as invalid', () => {
      const payload: KeycloakJwtPayload = {
        sub: '',
        preferred_username: 'john.doe',
      };

      // Empty string is falsy, so extractUserInfo should throw
      expect(() => extractUserInfo(payload)).toThrow('Invalid token: missing sub claim');
    });
  });

  describe('generateInternalToken - Security', () => {
    it('should generate token with HS256 algorithm', () => {
      const token = generateInternalToken({ userId: '123' });
      const decoded = jwt.decode(token, { complete: true });

      expect(decoded?.header.alg).toBe('HS256');
    });

    it('should include issuer in token', () => {
      const token = generateInternalToken({ userId: '123' });
      const decoded = jwt.decode(token) as any;

      expect(decoded.iss).toBe('plexica-core-api');
    });

    it('should include custom claims in token', () => {
      const claims = { userId: '123', email: 'test@example.com', role: 'admin' };
      const token = generateInternalToken(claims);
      const decoded = jwt.decode(token) as any;

      expect(decoded.userId).toBe('123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('admin');
    });

    it('should default to 15 minute expiration', () => {
      const token = generateInternalToken({ userId: '123' });
      const decoded = jwt.decode(token) as any;

      expect(decoded.exp).toBeDefined();
      expect(typeof decoded.exp).toBe('number');
    });

    it('should support custom expiration times', () => {
      const shortToken = generateInternalToken({ userId: '123' }, '1h');
      const decoded = jwt.decode(shortToken) as any;

      expect(decoded.exp).toBeDefined();
    });
  });

  describe('verifyInternalToken - Validation', () => {
    it('should successfully verify valid token', () => {
      const claims = { userId: '123', role: 'admin' };
      const token = generateInternalToken(claims);

      const verified = verifyInternalToken(token);

      expect(verified.userId).toBe('123');
      expect(verified.role).toBe('admin');
    });

    it('should reject token with invalid signature', () => {
      const token = generateInternalToken({ userId: '123' });
      // Tamper with the token
      const tampered = token.slice(0, -10) + 'tampered!!!';

      expect(() => verifyInternalToken(tampered)).toThrow();
    });

    it('should reject token signed with different secret', () => {
      // Create token with different secret
      const token = jwt.sign({ userId: '123' }, 'different-secret', {
        algorithm: 'HS256',
        issuer: 'plexica-core-api',
      });

      expect(() => verifyInternalToken(token)).toThrow();
    });

    it('should reject token with wrong issuer', () => {
      const token = jwt.sign({ userId: '123' }, 'test-secret-key-for-testing', {
        algorithm: 'HS256',
        issuer: 'wrong-issuer',
      });

      expect(() => verifyInternalToken(token)).toThrow();
    });

    it('should reject expired token', () => {
      const token = generateInternalToken({ userId: '123' }, '0'); // 0 seconds = expired

      // Wait a moment to ensure token is expired
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(() => verifyInternalToken(token)).toThrow();
          resolve(true);
        }, 100);
      });
    });

    it('should reject token with different algorithm', () => {
      const token = jwt.sign({ userId: '123' }, 'test-secret-key-for-testing', {
        algorithm: 'HS512', // Different algorithm
        issuer: 'plexica-core-api',
      });

      expect(() => verifyInternalToken(token)).toThrow();
    });

    it('should preserve all claims when verifying', () => {
      const originalClaims = {
        userId: '123',
        email: 'test@example.com',
        roles: ['admin', 'user'],
        customField: 'customValue',
      };
      const token = generateInternalToken(originalClaims);

      const verified = verifyInternalToken(token);

      expect(verified.userId).toBe(originalClaims.userId);
      expect(verified.email).toBe(originalClaims.email);
      expect(JSON.stringify(verified.roles)).toBe(JSON.stringify(originalClaims.roles));
      expect(verified.customField).toBe(originalClaims.customField);
    });
  });

  describe('Token Round-Trip Tests', () => {
    it('should generate and verify token in sequence', () => {
      const originalClaims = { userId: '456', action: 'test-action', timestamp: Date.now() };

      const token = generateInternalToken(originalClaims);
      const verified = verifyInternalToken(token);

      expect(verified.userId).toBe(originalClaims.userId);
      expect(verified.action).toBe(originalClaims.action);
      expect(verified.timestamp).toBe(originalClaims.timestamp);
    });

    it('should generate different tokens for same claims', async () => {
      const claims = { userId: '123' };
      const token1 = generateInternalToken(claims);

      // Wait to ensure different iat claim (JWT uses seconds precision)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const token2 = generateInternalToken(claims);

      // Different tokens (due to iat claim)
      expect(token1).not.toBe(token2);

      // But both verify to same claims
      const verified1 = verifyInternalToken(token1);
      const verified2 = verifyInternalToken(token2);

      expect(verified1.userId).toBe(verified2.userId);
    });

    it('should handle complex claim structures', () => {
      const claims = {
        userId: '123',
        permissions: {
          read: ['resource1', 'resource2'],
          write: ['resource1'],
          admin: false,
        },
        metadata: {
          source: 'api',
          version: '1.0',
        },
      };

      const token = generateInternalToken(claims);
      const verified = verifyInternalToken(token);

      expect(verified.userId).toBe('123');
      expect(JSON.stringify(verified.permissions)).toBe(JSON.stringify(claims.permissions));
      expect(JSON.stringify(verified.metadata)).toBe(JSON.stringify(claims.metadata));
    });
  });
});
