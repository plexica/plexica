// validation-schemas.test.ts
// Pure unit tests for Zod schemas across workspace, tenant-settings, and pagination modules.
// No mocks needed — all schemas are stateless pure validators.

import { describe, expect, it } from 'vitest';

import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceListQuerySchema,
} from '../../modules/workspace/schema.js';
import { updateBrandingSchema } from '../../modules/tenant-settings/schema.js';
import { paginationSchema } from '../../lib/pagination.js';
import { SLUG_REGEX } from '../../lib/slug.js';

// ===========================================================================
// Workspace name validation (createWorkspaceSchema.name)
// ===========================================================================

describe('Workspace name — createWorkspaceSchema', () => {
  it('rejects empty string (min 1)', () => {
    expect(createWorkspaceSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('accepts 1 character', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'A' }).success).toBe(true);
  });

  it('accepts 255 characters (max boundary)', () => {
    const name = 'a'.repeat(255);
    expect(createWorkspaceSchema.safeParse({ name }).success).toBe(true);
  });

  it('rejects 256 characters (max + 1)', () => {
    const name = 'a'.repeat(256);
    expect(createWorkspaceSchema.safeParse({ name }).success).toBe(false);
  });

  it('accepts a normal workspace name', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'Engineering' }).success).toBe(true);
  });
});

describe('Workspace name — updateWorkspaceSchema', () => {
  it('name is optional (no name → valid)', () => {
    expect(updateWorkspaceSchema.safeParse({}).success).toBe(true);
  });

  it('rejects empty string when name is provided', () => {
    expect(updateWorkspaceSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('accepts valid name when provided', () => {
    expect(updateWorkspaceSchema.safeParse({ name: 'Sales' }).success).toBe(true);
  });
});

// ===========================================================================
// Workspace slug regex (SLUG_REGEX)
// ===========================================================================

describe('SLUG_REGEX', () => {
  it('"valid-slug" → valid', () => {
    expect(SLUG_REGEX.test('valid-slug')).toBe(true);
  });

  it('"1invalid" (starts with digit) → invalid', () => {
    expect(SLUG_REGEX.test('1invalid')).toBe(false);
  });

  it('"UPPER" (uppercase letters) → invalid', () => {
    expect(SLUG_REGEX.test('UPPER')).toBe(false);
  });

  it('"ab" (2 chars, minimum valid length) → valid', () => {
    expect(SLUG_REGEX.test('ab')).toBe(true);
  });

  it('"a" (1 char, below minimum 2 total) → invalid (regex requires 1 leading + 1 more)', () => {
    // SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/ — so "a" (only 1 char) fails the {1,62} part
    expect(SLUG_REGEX.test('a')).toBe(false);
  });

  it('"a1" → valid', () => {
    expect(SLUG_REGEX.test('a1')).toBe(true);
  });

  it('63-char slug → valid (max boundary: 1 + 62)', () => {
    const slug = 'a' + 'b'.repeat(62);
    expect(SLUG_REGEX.test(slug)).toBe(true);
  });

  it('64-char slug → invalid (exceeds 63 max)', () => {
    const slug = 'a' + 'b'.repeat(63);
    expect(SLUG_REGEX.test(slug)).toBe(false);
  });
});

// ===========================================================================
// Hex color — updateBrandingSchema.primaryColor
// ===========================================================================

describe('Hex color — updateBrandingSchema.primaryColor', () => {
  it('"#FF5733" → valid', () => {
    expect(updateBrandingSchema.safeParse({ primaryColor: '#FF5733' }).success).toBe(true);
  });

  it('"FF5733" (no hash) → invalid', () => {
    expect(updateBrandingSchema.safeParse({ primaryColor: 'FF5733' }).success).toBe(false);
  });

  it('"#GGG" (invalid hex chars) → invalid', () => {
    expect(updateBrandingSchema.safeParse({ primaryColor: '#GGG' }).success).toBe(false);
  });

  it('"#fff" (3-char) → invalid (schema requires exactly 6 hex digits)', () => {
    // HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/ — 3-char fails
    expect(updateBrandingSchema.safeParse({ primaryColor: '#fff' }).success).toBe(false);
  });

  it('"#000000" → valid', () => {
    expect(updateBrandingSchema.safeParse({ primaryColor: '#000000' }).success).toBe(true);
  });

  it('primaryColor is optional (omitting it → valid)', () => {
    expect(updateBrandingSchema.safeParse({}).success).toBe(true);
  });
});

// ===========================================================================
// Pagination schema
// ===========================================================================

describe('paginationSchema', () => {
  it('page=0 → invalid (min 1)', () => {
    expect(paginationSchema.safeParse({ page: '0', limit: '10' }).success).toBe(false);
  });

  it('page=1 → valid', () => {
    expect(paginationSchema.safeParse({ page: '1', limit: '10' }).success).toBe(true);
  });

  it('limit=0 → invalid (min 1)', () => {
    expect(paginationSchema.safeParse({ page: '1', limit: '0' }).success).toBe(false);
  });

  it('limit=101 → invalid (max 100)', () => {
    expect(paginationSchema.safeParse({ page: '1', limit: '101' }).success).toBe(false);
  });

  it('limit=100 → valid (max boundary)', () => {
    expect(paginationSchema.safeParse({ page: '1', limit: '100' }).success).toBe(true);
  });

  it('defaults: missing page defaults to 1, missing limit defaults to 20', () => {
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });
});

// ===========================================================================
// workspaceListQuerySchema (extends paginationSchema)
// ===========================================================================

describe('workspaceListQuerySchema', () => {
  it('status="active" → valid', () => {
    expect(workspaceListQuerySchema.safeParse({ status: 'active' }).success).toBe(true);
  });

  it('status="archived" → valid', () => {
    expect(workspaceListQuerySchema.safeParse({ status: 'archived' }).success).toBe(true);
  });

  it('status="deleted" → invalid (not in enum)', () => {
    expect(workspaceListQuerySchema.safeParse({ status: 'deleted' }).success).toBe(false);
  });

  it('defaults: sort="name", order="asc"', () => {
    const result = workspaceListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('name');
      expect(result.data.order).toBe('asc');
    }
  });
});
