// File: packages/cli/src/utils/validate-manifest.ts

import { z } from 'zod';

const PluginRouteSchema = z.object({
  path: z.string(),
  componentName: z.string(),
  title: z.string(),
  layout: z.enum(['default', 'fullscreen', 'minimal']).optional(),
  permissions: z.array(z.string()).optional(),
});

const PluginMenuItemSchema: z.ZodType<any> = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  path: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  order: z.number().optional(),
  children: z.array(z.lazy(() => PluginMenuItemSchema)).optional(),
});

const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Plugin ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9]+)?$/, 'Version must follow semver format'),
  description: z.string().min(1),
  author: z.string().min(1),
  icon: z.string().optional(),
  routes: z.array(PluginRouteSchema),
  menuItems: z.array(PluginMenuItemSchema),
  permissions: z.array(z.string()).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export function validateManifest(manifest: unknown): { valid: boolean; errors?: string[] } {
  const result = PluginManifestSchema.safeParse(manifest);

  if (result.success) {
    return { valid: true };
  }

  const errors = result.error.issues.map((err: any) => {
    const path = err.path.join('.');
    return `${path}: ${err.message}`;
  });

  return { valid: false, errors };
}
