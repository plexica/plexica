// manifest-validator.test.ts
// Unit tests for validateManifest() business rules (Spec 004, Phase 1).
// Placeholder file — run via `pnpm test` once vitest picks up module-level __tests__.

import { describe, expect, it } from 'vitest';

import { validateManifest } from '../services/manifest-validator.service.js';

// Minimal stub PrismaClient — validateManifest only touches plugin.findUnique
// via findPluginBySlug(). Returning null means "no slug conflict".
function makeStubPrisma(): any {
  return { plugin: { findUnique: async () => null } };
}

const baseManifest = {
  slug: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  description: 'A test plugin',
  author: 'Test',
  icon: 'icon.png',
  categories: [],
  hosting: { type: 'sidecar' as const, image: 'test/test:1.0.0', port: 3000 },
  declaredTables: [],
};

describe('validateManifest — unit', () => {
  it('accepts a valid manifest', async () => {
    const result = await validateManifest(makeStubPrisma(), baseManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects manifest with missing required fields', async () => {
    const result = await validateManifest(makeStubPrisma(), { slug: 'test-plugin' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects duplicate action keys', async () => {
    const result = await validateManifest(
      makeStubPrisma(),
      {
        ...baseManifest,
        actions: [
          { action: 'test-plugin:contact:create', label: 'Create', defaultRole: 'member' },
          { action: 'test-plugin:contact:create', label: 'Create dup', defaultRole: 'admin' },
        ],
      }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate action keys'))).toBe(true);
  });
});
