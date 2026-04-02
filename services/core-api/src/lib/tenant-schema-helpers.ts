// tenant-schema-helpers.ts
// Helper functions for tenant schema creation and validation.

import { z } from 'zod';

// Slug validation regex: lowercase alphanumeric + hyphens, 3-51 chars.
// Max 51: "tenant_" prefix (7 chars) + 51 = 58 chars, safely under PostgreSQL's
// 63-char identifier limit (NAMEDATALEN=64). Prevents silent schema name truncation
// that could cause two tenants to share the same PostgreSQL schema.
// Must start with letter, end with alphanumeric (no trailing hyphens).
// Exported so tenant-context.ts and tenant-routes.ts share the same canonical regex.
//
// M-02 (spec alignment): the original spec wrote /^[a-z][a-z0-9-]{1,62}$/ which would
// allow up to 63-char slugs. With the "tenant_" prefix that would produce 70-char schema
// names, exceeding PostgreSQL's NAMEDATALEN=64. The implementation deliberately tightens
// the limit to 51 chars. This divergence is intentional and documented in the decision log.
export const SLUG_REGEX = /^[a-z][a-z0-9-]{1,49}[a-z0-9]$/;

export const slugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(51, 'Slug must be at most 51 characters')
  .regex(
    SLUG_REGEX,
    'Slug must be lowercase alphanumeric + hyphens, start with a letter, end with alphanumeric'
  );

export type SlugValidationResult = { valid: true; slug: string } | { valid: false; error: string };

export function validateSlug(slug: string): SlugValidationResult {
  const result = slugSchema.safeParse(slug);
  if (!result.success) {
    return {
      valid: false,
      error: `Invalid slug: ${result.error.issues[0]?.message ?? 'unknown error'}`,
    };
  }
  return { valid: true, slug: result.data };
}

export function toSchemaName(slug: string): string {
  // Hyphens are not valid in PostgreSQL schema names — convert to underscores
  return `tenant_${slug.replace(/-/g, '_')}`;
}

export function toRealmName(slug: string): string {
  return `plexica-${slug}`;
}

export interface TenantCreationError {
  code: 'ALREADY_EXISTS' | 'DB_CONNECTION' | 'MIGRATION_FAILED' | 'INVALID_SLUG';
  message: string;
}

export function isAlreadyExistsError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('already exists') || error.message.includes('duplicate key');
  }
  return false;
}
