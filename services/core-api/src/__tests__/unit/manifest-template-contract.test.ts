// Test that a manifest shaped exactly like the CLI template output passes the
// platform's real Zod validation (M-2: F1 was fixed ad-hoc in the CLI smoke
// tests; this pins the generated manifest contract to the actual schema).

import { describe, expect, it } from 'vitest';

import { manifestSchema } from '../../modules/plugin/schema/manifest.js';

// Shape mirrors packages/cli/src/templates.ts 'manifest.json'.
const TEMPLATE_MANIFEST = {
  slug: 'acme-crm',
  name: 'Acme CRM',
  version: '1.0.0',
  description: 'A Plexica plugin',
  author: 'Plugin Author',
  icon: 'Package',
  categories: [],
  hosting: { type: 'sidecar', image: 'acme-crm:latest', port: 3000 },
  ui: { remoteEntry: 'remoteEntry.js', extensionPoints: ['sidebar:admin'] },
  events: { subscribes: [] },
  declaredTables: [],
};

describe('CLI template manifest contract', () => {
  it('passes the platform manifestSchema', () => {
    const result = manifestSchema.safeParse(TEMPLATE_MANIFEST);
    expect(result.success).toBe(true);
  });

  it('rejects the manifest that failed before the F1 fix (empty author, no icon)', () => {
    const broken = {
      ...TEMPLATE_MANIFEST,
      author: '',
      icon: undefined,
    };
    const result = manifestSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });
});