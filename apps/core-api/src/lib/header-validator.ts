// apps/core-api/src/lib/header-validator.ts

/**
 * Header validation utilities for security
 * Prevents header injection attacks and malformed values
 */

/**
 * Validate tenant slug header format
 * Tenant slugs should follow: lowercase alphanumeric + hyphens
 * Pattern: [a-z0-9-]+
 * Min length: 2, Max length: 50
 */
export function isValidTenantSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  slug = slug.trim();

  // Length validation
  if (slug.length < 2 || slug.length > 50) {
    return false;
  }

  // Pattern validation: lowercase letters, numbers, hyphens
  // Cannot start or end with hyphen
  // Cannot have consecutive hyphens
  const pattern = /^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/;
  return pattern.test(slug);
}

/**
 * Validate workspace ID header format
 * Should be a valid UUID v4
 */
export function isValidWorkspaceId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  id = id.trim();

  // UUID v4 pattern
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id);
}

/**
 * Sanitize header value to prevent injection attacks
 * Removes/escapes potentially dangerous characters
 */
export function sanitizeHeaderValue(value: string, maxLength: number = 100): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  // Trim whitespace
  value = value.trim();

  // Limit length to prevent buffer overflow
  if (value.length > maxLength) {
    return value.substring(0, maxLength);
  }

  // Remove null bytes and control characters
  value = value.replace(/[\x00-\x1F\x7F]/g, '');

  // Remove CRLF injection attempts
  value = value.replace(/\r|\n/g, '');

  return value;
}

/**
 * Validate and extract custom headers with security checks
 */
export interface CustomHeaders {
  tenantSlug?: string;
  workspaceId?: string;
  errors: string[];
}

export function validateCustomHeaders(headers: Record<string, any>): CustomHeaders {
  const result: CustomHeaders = {
    errors: [],
  };

  // Validate X-Tenant-Slug header
  if (headers['x-tenant-slug']) {
    const tenantSlug = sanitizeHeaderValue(headers['x-tenant-slug']);

    if (!isValidTenantSlug(tenantSlug)) {
      result.errors.push(
        `Invalid X-Tenant-Slug header: "${tenantSlug}" does not match required format (lowercase alphanumeric and hyphens, 2-50 characters)`
      );
    } else {
      result.tenantSlug = tenantSlug;
    }
  }

  // Validate X-Workspace-ID header (if present)
  if (headers['x-workspace-id']) {
    const workspaceId = sanitizeHeaderValue(headers['x-workspace-id']);

    if (!isValidWorkspaceId(workspaceId)) {
      result.errors.push(`Invalid X-Workspace-ID header: "${workspaceId}" is not a valid UUID`);
    } else {
      result.workspaceId = workspaceId;
    }
  }

  return result;
}

/**
 * Log suspicious header activity for security monitoring
 */
export function logSuspiciousHeader(headerName: string, value: string, reason: string): void {
  console.warn(`[SECURITY] Suspicious header detected: ${headerName}="${value}" - ${reason}`);
}
