// schema/manifest.ts
// Zod schema for full plugin manifest validation (DR-15).

import { z } from 'zod';

const slugRegex = /^[a-z][a-z0-9-]{1,62}$/;
const semverRegex = /^\d+\.\d+\.\d+$/;

export const hostingSchema = z.object({
  type: z.enum(['sidecar', 'kubernetes']),
  image: z.string().min(1).max(512),
  imagePullSecret: z.string().optional(),
  port: z.number().int().positive().default(3000),
  resources: z
    .object({
      cpu: z.string().optional(),
      memory: z.string().optional(),
    })
    .optional(),
});

export const declaredTableSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, 'Table name must be snake_case'),
  description: z.string().optional(),
  migrationFile: z.string().min(1),
});

export const actionSchema = z.object({
  action: z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, 'Plugin actions must be 3-part: slug:resource:verb'),
  label: z.string().min(1),
  description: z.string().optional(),
  defaultRole: z.enum(['admin', 'member', 'viewer']),
});

export const manifestSchema = z.object({
  slug: z.string().regex(slugRegex, 'Slug must match /^[a-z][a-z0-9-]{1,62}$/'),
  name: z.string().min(1).max(255),
  version: z.string().regex(semverRegex, 'Version must be semver (x.y.z)'),
  description: z.string().min(1).max(1000),
  author: z.string().min(1).max(255),
  icon: z.string().min(1),
  categories: z.array(z.string()).default([]),
  hosting: hostingSchema,
  ui: z
    .object({
      remoteEntry: z.string().default('remoteEntry.js'),
      extensionPoints: z.array(z.string()).default([]),
    })
    .optional(),
  events: z
    .object({
      subscribes: z.array(z.string()).default([]),
    })
    .optional(),
  actions: z.array(actionSchema).optional(),
  declaredTables: z.array(declaredTableSchema).default([]),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestAction = z.infer<typeof actionSchema>;
export type DeclaredTable = z.infer<typeof declaredTableSchema>;
