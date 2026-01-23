// Comprehensive tests for validator functions
import { describe, it, expect, vi } from 'vitest';
import {
  isValidCorsOrigin,
  parseCorsOrigins,
  createCorsOriginMatcher,
} from '../../lib/cors-validator';
import {
  isValidTenantSlug,
  isValidWorkspaceId,
  sanitizeHeaderValue,
  validateCustomHeaders,
} from '../../lib/header-validator';

describe('CORS Validator', () => {
  describe('isValidCorsOrigin', () => {
    it('should accept valid https origins', () => {
      expect(isValidCorsOrigin('https://example.com')).toBe(true);
      expect(isValidCorsOrigin('https://api.example.com')).toBe(true);
      expect(isValidCorsOrigin('https://subdomain.example.co.uk')).toBe(true);
    });

    it('should accept valid http origins', () => {
      expect(isValidCorsOrigin('http://localhost:3000')).toBe(true);
      expect(isValidCorsOrigin('http://localhost:8080')).toBe(true);
      expect(isValidCorsOrigin('http://127.0.0.1:3000')).toBe(true);
    });

    it('should accept wildcard origin', () => {
      expect(isValidCorsOrigin('*')).toBe(true);
    });

    it('should reject origins without protocol', () => {
      expect(isValidCorsOrigin('example.com')).toBe(false);
      expect(isValidCorsOrigin('localhost:3000')).toBe(false);
    });

    it('should reject origins with invalid protocol', () => {
      expect(isValidCorsOrigin('ftp://example.com')).toBe(false);
      expect(isValidCorsOrigin('ws://example.com')).toBe(false);
    });

    it('should reject origins with query parameters', () => {
      expect(isValidCorsOrigin('https://example.com?test=true')).toBe(false);
    });

    it('should reject origins with hash fragments', () => {
      expect(isValidCorsOrigin('https://example.com#section')).toBe(false);
    });

    it('should reject null, undefined, and non-string values', () => {
      expect(isValidCorsOrigin('')).toBe(false);
      expect(isValidCorsOrigin(null as any)).toBe(false);
      expect(isValidCorsOrigin(undefined as any)).toBe(false);
    });

    it('should handle whitespace in origins', () => {
      expect(isValidCorsOrigin('  https://example.com  ')).toBe(true);
      expect(isValidCorsOrigin('\thttps://example.com\n')).toBe(true);
    });

    it('should reject malformed URLs', () => {
      expect(isValidCorsOrigin('https://')).toBe(false);
      expect(isValidCorsOrigin('https://:::::::')).toBe(false);
    });
  });

  describe('parseCorsOrigins', () => {
    it('should parse comma-separated origins', () => {
      const origins = parseCorsOrigins('https://example.com,https://api.example.com');
      expect(origins).toContain('https://example.com');
      expect(origins).toContain('https://api.example.com');
    });

    it('should filter out invalid origins', () => {
      const origins = parseCorsOrigins('https://example.com,invalid,https://api.example.com');
      expect(origins).toContain('https://example.com');
      expect(origins).toContain('https://api.example.com');
      expect(origins).not.toContain('invalid');
    });

    it('should trim whitespace from origins', () => {
      const origins = parseCorsOrigins('  https://example.com  ,  https://api.example.com  ');
      expect(origins).toHaveLength(2);
    });

    it('should return default origin for empty string', () => {
      const origins = parseCorsOrigins('');
      expect(origins).toEqual(['http://localhost:3001']);
    });

    it('should return default origin for all invalid origins', () => {
      const origins = parseCorsOrigins('invalid,malformed');
      expect(origins).toEqual(['http://localhost:3001']);
    });

    it('should handle null or undefined', () => {
      expect(parseCorsOrigins(null as any)).toEqual(['http://localhost:3001']);
      expect(parseCorsOrigins(undefined as any)).toEqual(['http://localhost:3001']);
    });
  });

  describe('createCorsOriginMatcher', () => {
    it('should allow origins in allowed list', () => {
      const matcher = createCorsOriginMatcher(['https://example.com']);
      const callback = vi.fn();
      matcher('https://example.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should deny origins not in allowed list', () => {
      const matcher = createCorsOriginMatcher(['https://example.com']);
      const callback = vi.fn();
      matcher('https://unauthorized.com', callback);
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should allow wildcard', () => {
      const matcher = createCorsOriginMatcher(['*']);
      const callback = vi.fn();
      matcher('https://any-origin.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should allow no origin (same-origin requests)', () => {
      const matcher = createCorsOriginMatcher(['https://example.com']);
      const callback = vi.fn();
      matcher(undefined, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should handle multiple allowed origins', () => {
      const matcher = createCorsOriginMatcher([
        'https://example.com',
        'https://api.example.com',
        'http://localhost:3000',
      ]);
      const callback = vi.fn();

      matcher('https://api.example.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });
});

describe('Header Validator', () => {
  describe('isValidTenantSlug', () => {
    it('should accept valid tenant slugs', () => {
      expect(isValidTenantSlug('acme-corp')).toBe(true);
      expect(isValidTenantSlug('test-tenant-1')).toBe(true);
      expect(isValidTenantSlug('a1b2c3')).toBe(true);
    });

    it('should accept minimum valid slug (2 chars)', () => {
      expect(isValidTenantSlug('ab')).toBe(true);
    });

    it('should accept maximum valid slug (50 chars)', () => {
      const slug50 = 'a'.repeat(49) + 'b'; // 50 chars
      expect(isValidTenantSlug(slug50)).toBe(true);
    });

    it('should reject too short slugs', () => {
      expect(isValidTenantSlug('a')).toBe(false);
    });

    it('should reject too long slugs', () => {
      const slug51 = 'a'.repeat(51);
      expect(isValidTenantSlug(slug51)).toBe(false);
    });

    it('should reject uppercase characters', () => {
      expect(isValidTenantSlug('ACME-Corp')).toBe(false);
      expect(isValidTenantSlug('Acme-corp')).toBe(false);
    });

    it('should reject special characters', () => {
      expect(isValidTenantSlug('acme@corp')).toBe(false);
      expect(isValidTenantSlug('acme_corp')).toBe(false);
      expect(isValidTenantSlug('acme.corp')).toBe(false);
    });

    it('should reject starting or ending with hyphen', () => {
      expect(isValidTenantSlug('-acme-corp')).toBe(false);
      expect(isValidTenantSlug('acme-corp-')).toBe(false);
    });

    it('should allow consecutive hyphens in the middle', () => {
      // Pattern allows [a-z0-9]([a-z0-9-]{0,48}[a-z0-9])? so middle can have hyphens
      expect(isValidTenantSlug('acme--corp')).toBe(true);
    });

    it('should reject null and empty values', () => {
      expect(isValidTenantSlug('')).toBe(false);
      expect(isValidTenantSlug(null as any)).toBe(false);
      expect(isValidTenantSlug(undefined as any)).toBe(false);
    });

    it('should handle whitespace trimming', () => {
      expect(isValidTenantSlug('  acme-corp  ')).toBe(true);
    });
  });

  describe('isValidWorkspaceId', () => {
    it('should accept valid UUID v4', () => {
      expect(isValidWorkspaceId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidWorkspaceId('12345678-1234-4234-b234-123456789012')).toBe(true);
    });

    it('should reject non-UUID values', () => {
      expect(isValidWorkspaceId('not-a-uuid')).toBe(false);
      expect(isValidWorkspaceId('12345678')).toBe(false);
    });

    it('should reject UUID v3', () => {
      expect(isValidWorkspaceId('550e8400-e29b-31d4-a716-446655440000')).toBe(false);
    });

    it('should reject null and empty values', () => {
      expect(isValidWorkspaceId('')).toBe(false);
      expect(isValidWorkspaceId(null as any)).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isValidWorkspaceId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidWorkspaceId('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });
  });

  describe('sanitizeHeaderValue', () => {
    it('should trim whitespace', () => {
      expect(sanitizeHeaderValue('  test  ')).toBe('test');
      expect(sanitizeHeaderValue('\ttest\n')).toBe('test');
    });

    it('should limit to maxLength', () => {
      const result = sanitizeHeaderValue('very long string', 5);
      expect(result).toBe('very ');
      expect(result.length).toBe(5);
    });

    it('should remove null bytes', () => {
      expect(sanitizeHeaderValue('test\x00value')).toBe('testvalue');
    });

    it('should remove control characters', () => {
      expect(sanitizeHeaderValue('test\x01\x1fvalue')).toBe('testvalue');
    });

    it('should remove CRLF injection attempts', () => {
      expect(sanitizeHeaderValue('test\r\nvalue')).toBe('testvalue');
      expect(sanitizeHeaderValue('test\rvalue')).toBe('testvalue');
      expect(sanitizeHeaderValue('test\nvalue')).toBe('testvalue');
    });

    it('should handle empty and null values', () => {
      expect(sanitizeHeaderValue('')).toBe('');
      expect(sanitizeHeaderValue(null as any)).toBe('');
    });

    it('should use default maxLength of 100', () => {
      const longString = 'a'.repeat(150);
      const result = sanitizeHeaderValue(longString);
      expect(result.length).toBe(100);
    });
  });

  describe('validateCustomHeaders', () => {
    it('should validate valid X-Tenant-Slug header', () => {
      const headers = { 'x-tenant-slug': 'test-tenant' };
      const result = validateCustomHeaders(headers);
      expect(result.tenantSlug).toBe('test-tenant');
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid X-Workspace-ID header', () => {
      const headers = { 'x-workspace-id': '550e8400-e29b-41d4-a716-446655440000' };
      const result = validateCustomHeaders(headers);
      expect(result.workspaceId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.errors).toHaveLength(0);
    });

    it('should validate both headers together', () => {
      const headers = {
        'x-tenant-slug': 'test-tenant',
        'x-workspace-id': '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = validateCustomHeaders(headers);
      expect(result.tenantSlug).toBe('test-tenant');
      expect(result.workspaceId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.errors).toHaveLength(0);
    });

    it('should report error for invalid tenant slug', () => {
      const headers = { 'x-tenant-slug': 'INVALID' };
      const result = validateCustomHeaders(headers);
      expect(result.tenantSlug).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid X-Tenant-Slug');
    });

    it('should report error for invalid workspace ID', () => {
      const headers = { 'x-workspace-id': 'not-a-uuid' };
      const result = validateCustomHeaders(headers);
      expect(result.workspaceId).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid X-Workspace-ID');
    });

    it('should report multiple errors', () => {
      const headers = {
        'x-tenant-slug': 'INVALID',
        'x-workspace-id': 'not-a-uuid',
      };
      const result = validateCustomHeaders(headers);
      expect(result.errors).toHaveLength(2);
    });

    it('should handle missing headers', () => {
      const headers = {};
      const result = validateCustomHeaders(headers);
      expect(result.tenantSlug).toBeUndefined();
      expect(result.workspaceId).toBeUndefined();
      expect(result.errors).toHaveLength(0);
    });

    it('should sanitize header values before validation', () => {
      const headers = { 'x-tenant-slug': '  test-tenant\r\n  ' };
      const result = validateCustomHeaders(headers);
      expect(result.tenantSlug).toBe('test-tenant');
      expect(result.errors).toHaveLength(0);
    });
  });
});
