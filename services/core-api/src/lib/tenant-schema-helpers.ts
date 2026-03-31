// tenant-schema-helpers.ts
// Helper functions for tenant schema creation and validation.

import { z } from 'zod';

// Slug validation regex: lowercase alphanumeric + hyphens, 3-63 chars
// Must start with letter, end with alphanumeric
const SLUG_REGEX = /^[a-z][a-z0-9-]{1,61}[a-z0-9]$/;

export const slugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(63, 'Slug must be at most 63 characters')
  .regex(
    SLUG_REGEX,
    'Slug must be lowercase alphanumeric + hyphens, start with a letter, end with alphanumeric'
  );

export type SlugValidationResult =
  | { valid: true; slug: string }
  | { valid: false; error: string };

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
