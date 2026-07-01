// services/manifest-validator.service.ts
// Full manifest validation: Zod parse + business rules.

import { manifestSchema, type Manifest } from '../schema/manifest.js';

import { findPluginBySlug } from './registry.service.js';

import type { PrismaClient } from '@prisma/client';

export interface ValidationResult {
  valid: boolean;
  manifest?: Manifest;
  errors: string[];
}

const CORE_ACTION_PREFIXES = [
  'workspace:',
  'user:',
  'tenant:',
  'plugin:',
  'invitation:',
  'member:',
  'role:',
  'settings:',
  'audit:',
  'profile:',
  'abac:',
];

export async function validateManifest(
  prisma: PrismaClient,
  raw: unknown,
  existingPluginId?: string
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Step 1: Zod validation
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => `[${i.path.join('.')}] ${i.message}`),
    };
  }

  const manifest = parsed.data;

  // Step 2: Slug uniqueness (skip if updating own plugin)
  const existing = await findPluginBySlug(prisma, manifest.slug);
  if (existing && existing.id !== existingPluginId) {
    errors.push(`Slug "${manifest.slug}" is already taken by plugin "${existing.name}"`);
  }

  // Step 3: Action key namespace check
  if (manifest.actions) {
    const keys = manifest.actions.map((a) => a.action);
    if (new Set(keys).size !== keys.length) {
      errors.push('Duplicate action keys detected');
    }

    for (const action of manifest.actions) {
      const parts = action.action.split(':');
      if (parts.length !== 3) {
        errors.push(`Action "${action.action}" must be 3-part format (slug:resource:verb)`);
        continue;
      }

      if (parts[0] !== manifest.slug) {
        errors.push(`Action "${action.action}" first segment must match plugin slug "${manifest.slug}"`);
      }

      const conflict = CORE_ACTION_PREFIXES.some((prefix) => action.action.startsWith(prefix));
      if (conflict) {
        errors.push(`Action "${action.action}" conflicts with core action namespace`);
      }
    }
  }

  // Step 4: Declared table naming convention
  // Slugs use kebab-case (e.g. "my-plugin") but table names use snake_case,
  // so we normalize the prefix by replacing hyphens with underscores.
  const tablePrefix = `${manifest.slug.replace(/-/g, '_')}_`;
  for (const table of manifest.declaredTables) {
    if (!table.name.startsWith(tablePrefix)) {
      errors.push(`Table "${table.name}" must be prefixed with "${tablePrefix}"`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, manifest, errors: [] };
}
