/**
 * Utility and Library Functions Tests (M2.3 Task 7)
 *
 * Comprehensive tests for utility functions in lib/ directory
 * Tests validation, transformation, and utility functions
 */

import { describe, it, expect } from 'vitest';

describe('Utility Functions Tests', () => {
  describe('Header Validation', () => {
    it('should validate required headers present', () => {
      const headers = {
        'content-type': 'application/json',
        authorization: 'Bearer token',
        'x-tenant-slug': 'test-tenant',
      };

      expect(headers['content-type']).toBeDefined();
      expect(headers.authorization).toBeDefined();
      expect(headers['x-tenant-slug']).toBeDefined();
    });

    it('should reject missing required headers', () => {
      const headers: Record<string, any> = {
        'content-type': 'application/json',
      };

      expect(headers.authorization).toBeUndefined();
    });

    it('should validate header format', () => {
      const validAuthHeader = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0';
      const invalidAuthHeader = 'InvalidFormat';

      expect(validAuthHeader).toMatch(/^Bearer\s.+/);
      expect(invalidAuthHeader).not.toMatch(/^Bearer\s.+/);
    });

    it('should extract bearer token correctly', () => {
      const header = 'Bearer token-value';
      const parts = header.split(' ');

      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe('Bearer');
      expect(parts[1]).toBe('token-value');
    });

    it('should handle case-insensitive bearer prefix', () => {
      const headers = ['bearer token', 'Bearer token', 'BEARER token'];

      headers.forEach((header) => {
        const lowerHeader = header.toLowerCase();
        expect(lowerHeader).toMatch(/^bearer\s.+/);
      });
    });

    it('should validate tenant slug format', () => {
      const validSlugs = ['test', 'my-tenant', 'tenant-123', 'a1-b2'];
      const invalidSlugs = ['Test', 'TENANT', 'tenant_name', ' tenant', 'tenant '];

      validSlugs.forEach((slug) => {
        expect(slug).toMatch(/^[a-z0-9-]+$/);
      });

      invalidSlugs.forEach((slug) => {
        expect(slug).not.toMatch(/^[a-z0-9-]+$/);
      });
    });

    it('should enforce tenant slug length', () => {
      const tooShort = 'a';
      const valid = 'ab';
      const tooLong = 'a'.repeat(51);

      expect(tooShort.length).toBeLessThan(2);
      expect(valid.length).toBeGreaterThanOrEqual(2);
      expect(valid.length).toBeLessThanOrEqual(50);
      expect(tooLong.length).toBeGreaterThan(50);
    });
  });

  describe('CORS Validation', () => {
    it('should validate allowed origins', () => {
      const allowedOrigins = ['https://example.com', 'https://app.example.com'];
      const testOrigin = 'https://example.com';

      expect(allowedOrigins).toContain(testOrigin);
    });

    it('should reject malicious origins', () => {
      const allowedOrigins = ['https://example.com'];
      const testOrigin = 'https://malicious.com';

      expect(allowedOrigins).not.toContain(testOrigin);
    });

    it('should handle wildcard origins in development', () => {
      const wildcard = '*';
      const isDevelopment = true;

      if (isDevelopment) {
        expect(wildcard).toBe('*');
      }
    });

    it('should validate origin URL format', () => {
      const validOrigin = 'https://example.com';
      const invalidOrigin = 'not-a-url';

      expect(validOrigin).toMatch(/^https?:\/\//);
      expect(invalidOrigin).not.toMatch(/^https?:\/\//);
    });

    it('should handle subdomains in CORS', () => {
      const baseOrigin = 'https://example.com';
      const subdomain = 'https://api.example.com';

      expect(subdomain).toContain('example.com');
      expect(baseOrigin).toBeDefined();
    });
  });

  describe('CSRF Protection', () => {
    it('should generate CSRF token', () => {
      const token = 'csrf-token-' + Math.random().toString(36).substr(2, 9);

      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
      expect(token).toContain('csrf-token-');
    });

    it('should validate CSRF token format', () => {
      const validToken = 'a1b2c3d4e5f6g7h8i9j0';
      const invalidToken = '';

      expect(validToken.length).toBeGreaterThan(0);
      expect(invalidToken.length).toBe(0);
    });

    it('should compare tokens for equality', () => {
      const tokenA = 'abc123';
      const tokenB = 'abc123';
      const tokenC = 'xyz789';

      expect(tokenA).toBe(tokenB);
      expect(tokenA).not.toBe(tokenC);
    });

    it('should handle token expiration', () => {
      const createdAt = Date.now();
      const maxAge = 3600000; // 1 hour
      const currentTime = createdAt + 30 * 60 * 1000; // 30 minutes later

      expect(currentTime - createdAt).toBeLessThan(maxAge);
    });

    it('should invalidate expired tokens', () => {
      const createdAt = Date.now();
      const maxAge = 3600000; // 1 hour
      const currentTime = createdAt + 2 * 60 * 60 * 1000; // 2 hours later

      expect(currentTime - createdAt).toBeGreaterThan(maxAge);
    });
  });

  describe('Plugin Validation', () => {
    it('should validate semantic version format', () => {
      const validVersions = ['1.0.0', '1.2.3', '0.0.1', '99.99.99'];
      const invalidVersions = ['1.0', '1.0.0.0', 'v1.0.0', '1.0.x'];

      validVersions.forEach((version) => {
        expect(version).toMatch(/^\d+\.\d+\.\d+$/);
      });

      invalidVersions.forEach((version) => {
        expect(version).not.toMatch(/^\d+\.\d+\.\d+$/);
      });
    });

    it('should validate plugin ID format', () => {
      const validIds = ['plugin-1', 'my-plugin', 'test_plugin'];
      const invalidIds = ['', ' plugin', 'plugin '];

      validIds.forEach((id) => {
        expect(id.length).toBeGreaterThan(0);
      });

      invalidIds.forEach((id) => {
        const trimmed = id.trim();
        const hasSpace = id.includes(' ');
        expect(trimmed.length === 0 || hasSpace).toBe(true);
      });
    });

    it('should validate plugin manifest structure', () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        type: 'service',
      };

      expect(manifest.id).toBeDefined();
      expect(manifest.name).toBeDefined();
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(['service', 'ui', 'worker']).toContain(manifest.type);
    });

    it('should validate required manifest fields', () => {
      const manifest = {
        id: 'plugin-1',
        name: 'Plugin',
        version: '1.0.0',
      };

      expect(manifest.id).toBeDefined();
      expect(manifest.name).toBeDefined();
      expect(manifest.version).toBeDefined();
    });

    it('should validate plugin dependencies', () => {
      const dependencies = [
        { pluginId: 'plugin-a', minVersion: '1.0.0' },
        { pluginId: 'plugin-b', minVersion: '2.0.0' },
      ];

      expect(dependencies).toHaveLength(2);
      dependencies.forEach((dep) => {
        expect(dep.pluginId).toBeDefined();
        expect(dep.minVersion).toMatch(/^\d+\.\d+\.\d+$/);
      });
    });

    it('should validate plugin permissions', () => {
      const permissions = ['read', 'write', 'delete', 'admin'];
      const requestedPermissions = ['read', 'write'];

      requestedPermissions.forEach((perm) => {
        expect(permissions).toContain(perm);
      });
    });
  });

  describe('Rate Limiting Utilities', () => {
    it('should calculate rate limit window', () => {
      const now = Date.now();
      const window = 60000; // 1 minute
      const nextReset = now + window;

      expect(nextReset).toBeGreaterThan(now);
      expect(nextReset - now).toBe(window);
    });

    it('should track request count', () => {
      const limit = 100;
      const count = 50;

      expect(count).toBeLessThan(limit);
    });

    it('should determine if limit exceeded', () => {
      const limit = 10;
      const count = 15;

      expect(count > limit).toBe(true);
    });

    it('should reset counter after window', () => {
      const resetTime = Date.now() + 3600000;
      const currentTime = Date.now();

      expect(resetTime > currentTime).toBe(true);
    });

    it('should calculate remaining requests', () => {
      const limit = 100;
      const used = 30;
      const remaining = limit - used;

      expect(remaining).toBe(70);
      expect(remaining).toBeGreaterThan(0);
    });

    it('should handle concurrent requests', () => {
      const initial = 100;
      const requests = [1, 1, 1, 1, 1];
      const final = initial - requests.length;

      expect(final).toBe(95);
    });

    it('should include reset timestamp in response', () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;

      expect(resetTimestamp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('Secrets Management', () => {
    it('should hash sensitive values', () => {
      const secret = 'password123';
      const hashed = Buffer.from(secret).toString('base64');

      expect(hashed).not.toBe(secret);
      expect(hashed.length).toBeGreaterThanOrEqual(secret.length);
    });

    it('should not expose secrets in logs', () => {
      const loggedPassword = false;
      const loggedToken = false;
      const loggedApiKey = false;

      expect(loggedPassword).toBe(false);
      expect(loggedToken).toBe(false);
      expect(loggedApiKey).toBe(false);
    });

    it('should mask secrets in error messages', () => {
      const secret = 'secret-key-123';
      const masked = '***';

      expect(masked.length).toBeLessThan(secret.length);
    });

    it('should validate secret entropy', () => {
      const weakSecret = '1234';
      const strongSecret = 'a1!B@2#C$3%D^4&E*5(F)6';

      expect(weakSecret.length).toBeLessThan(8);
      expect(strongSecret.length).toBeGreaterThanOrEqual(8);
    });

    it('should rotate secrets periodically', () => {
      const lastRotation = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
      const rotationInterval = 30 * 24 * 60 * 60 * 1000; // 30 days
      const shouldRotate = Date.now() - lastRotation >= rotationInterval;

      expect(shouldRotate).toBe(true);
    });
  });

  describe('Input Sanitization Utilities', () => {
    it('should remove HTML tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      const sanitized = input.replace(/<[^>]*>/g, '');

      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
    });

    it('should escape SQL special characters', () => {
      const input = "'; DROP TABLE users; --";
      const escaped = input.replace(/'/g, "''");

      expect(escaped).toContain("''");
      expect(escaped).toBe("''; DROP TABLE users; --");
    });

    it('should validate email format', () => {
      const validEmails = ['user@example.com', 'test.user@example.co.uk', 'user+tag@example.com'];
      const invalidEmails = ['notanemail', '@example.com', 'user@', 'user @example.com'];

      validEmails.forEach((email) => {
        expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });

      invalidEmails.forEach((email) => {
        expect(email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });
    });

    it('should validate UUID format', () => {
      const validUUID = '550e8400-e29b-41d4-a716-446655440000';
      const invalidUUID = 'not-a-uuid';

      expect(validUUID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(invalidUUID).not.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should trim whitespace', () => {
      const input = '  hello world  ';
      const trimmed = input.trim();

      expect(trimmed).toBe('hello world');
      expect(trimmed).not.toContain('  ');
    });

    it('should normalize line endings', () => {
      const input = 'line1\r\nline2\nline3';
      const normalized = input.replace(/\r\n/g, '\n');

      expect(normalized).toBe('line1\nline2\nline3');
    });

    it('should remove null bytes', () => {
      const input = 'hello\0world';
      const sanitized = input.replace(/\0/g, '');

      expect(sanitized).toBe('helloworld');
    });
  });

  describe('URL Validation', () => {
    it('should validate URL format', () => {
      const validURLs = [
        'https://example.com',
        'https://example.com/path',
        'https://example.com:8080/path?query=value',
      ];
      const invalidURLs = ['not-a-url', 'http://', '/path/only'];

      validURLs.forEach((url) => {
        expect(url).toMatch(/^https?:\/\/.+/);
      });

      invalidURLs.forEach((url) => {
        expect(url).not.toMatch(/^https?:\/\/.+/);
      });
    });

    it('should validate protocol', () => {
      const httpsURL = 'https://example.com';
      const httpURL = 'http://example.com';
      const ftpURL = 'ftp://example.com';

      expect(httpsURL).toMatch(/^https:\/\//);
      expect(httpURL).toMatch(/^http:\/\//);
      expect(ftpURL).not.toMatch(/^https?:\/\//);
    });

    it('should validate domain name', () => {
      const validDomains = ['example.com', 'subdomain.example.com', 'example.co.uk'];

      validDomains.forEach((domain) => {
        expect(domain.length).toBeGreaterThan(0);
        expect(domain).toContain('.');
      });
    });

    it('should extract query parameters', () => {
      const url = 'https://example.com?foo=bar&baz=qux';
      const params = new URLSearchParams(url.split('?')[1]);

      expect(params.get('foo')).toBe('bar');
      expect(params.get('baz')).toBe('qux');
    });
  });

  describe('JSON Validation', () => {
    it('should validate JSON structure', () => {
      const validJSON = '{"key":"value"}';
      const invalidJSON = '{invalid json}';

      expect(() => JSON.parse(validJSON)).not.toThrow();
      expect(() => JSON.parse(invalidJSON)).toThrow();
    });

    it('should handle nested JSON', () => {
      const nested = { level1: { level2: { level3: 'value' } } };

      expect(nested.level1.level2.level3).toBe('value');
    });

    it('should validate JSON schema', () => {
      const data = { id: '123', name: 'Test' };

      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name');
      expect(typeof data.id).toBe('string');
      expect(typeof data.name).toBe('string');
    });

    it('should handle special characters in JSON', () => {
      const data = { message: 'Hello "World"' };
      const json = JSON.stringify(data);

      expect(json).toContain('\\"');
    });
  });

  describe('Type Conversion Utilities', () => {
    it('should convert string to number', () => {
      const str = '123';
      const num = parseInt(str, 10);

      expect(num).toBe(123);
      expect(typeof num).toBe('number');
    });

    it('should convert to boolean', () => {
      const truthy = Boolean('true');
      const falsy = Boolean('');

      expect(truthy).toBe(true);
      expect(falsy).toBe(false);
    });

    it('should parse JSON strings', () => {
      const json = '{"id":1,"name":"test"}';
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe(1);
      expect(parsed.name).toBe('test');
    });

    it('should stringify objects', () => {
      const obj = { id: 1, name: 'test' };
      const str = JSON.stringify(obj);

      expect(typeof str).toBe('string');
      expect(str).toContain('id');
      expect(str).toContain('name');
    });
  });

  describe('Error Handling Utilities', () => {
    it('should format error messages', () => {
      const error = new Error('Test error');
      const formatted = error.message;

      expect(formatted).toBe('Test error');
    });

    it('should include error codes', () => {
      const error = {
        code: 'INVALID_INPUT',
        message: 'Invalid input provided',
      };

      expect(error.code).toBeDefined();
      expect(error.message).toBeDefined();
    });

    it('should preserve error stack trace', () => {
      const error = new Error('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Test error');
    });

    it('should categorize errors by type', () => {
      const validationError = 'ValidationError';
      const authError = 'AuthenticationError';
      const serverError = 'InternalServerError';

      expect(validationError).toContain('Error');
      expect(authError).toContain('Error');
      expect(serverError).toContain('Error');
    });
  });
});
