// tenant-schema-helpers.ts
// Helper functions for tenant schema creation and validation.

import { z } from 'zod';

import { TENANT_SLUG_REGEX } from './slug.js';

// Canonical tenant slug regex is TENANT_SLUG_REGEX in lib/slug.ts
// (3–51 chars — see that file for the NAMEDATALEN rationale). Consumers must
// import it from there — this module does not re-export it.

// Canonical guard for tenant schema identifiers before any SQL interpolation
// (schema names cannot be parameterised in DDL, so a strict allowlist regex
// is the defence-in-depth guard against SQL injection via corrupted slugs).
// `tenant_` (7) + 55 = 62 chars, under PostgreSQL's NAMEDATALEN=64. Slugs are
// capped at 51 by TENANT_SLUG_REGEX, so the 55-char bound never rejects a
// legitimately derived name.
export const SCHEMA_NAME_REGEX = /^tenant_[a-z0-9_]{1,55}$/;

export const slugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(51, 'Slug must be at most 51 characters')
  .regex(
    TENANT_SLUG_REGEX,
    'Slug must be lowercase alphanumeric + hyphens, start with a letter, end with alphanumeric'
  );

type SlugValidationResult = { valid: true; slug: string } | { valid: false; error: string };

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
