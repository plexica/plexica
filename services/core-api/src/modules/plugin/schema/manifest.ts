// schema/manifest.ts
// Zod schema for full plugin manifest validation (DR-15).

import path from 'node:path';

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
  // Reject path traversal: no absolute paths, no ".." components, no null bytes.
  migrationFile: z.string().min(1).refine(
    (v) => !v.includes('\0') && !v.includes('..') && !path.isAbsolute(v),
    'migrationFile must be a relative path without ".." or null bytes',
  ),
  content: z.string().optional(), // Inline SQL — preferred over filesystem read
});

export const actionSchema = z.object({
  action: z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, 'Plugin actions must be 3-part: slug:resource:verb'),
  label: z.string().min(1),
  description: z.string().optional(),
  defaultRole: z.enum(['admin', 'member', 'viewer']),
});

// CRITICAL #12 — optional mapping from HTTP method + path pattern to the
// 3-part plugin action key used for per-action ABAC enforcement.
// e.g. { method: 'POST', path: '/contacts', action: 'crm:contact:create' }.
// When absent, the proxy falls back to the generic "{slug}:access" key.
export const apiMappingSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1),
  action: z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, 'apiMapping action must be 3-part: slug:resource:verb'),
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
  apiMappings: z.array(apiMappingSchema).optional(),
  env: z.record(z.string()).optional(),
  declaredTables: z.array(declaredTableSchema).default([]),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestAction = z.infer<typeof actionSchema>;
export type ApiMapping = z.infer<typeof apiMappingSchema>;
export type DeclaredTable = z.infer<typeof declaredTableSchema>;
