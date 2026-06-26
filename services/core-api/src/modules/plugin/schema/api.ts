// schema/api.ts
// Zod schemas for plugin API endpoint inputs.

import { z } from 'zod';
import { manifestSchema } from './manifest.js';

export const registerPluginSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(255),
  registryUrl: z.string().url().max(512),
  imageName: z.string().min(1).max(255),
  imageTag: z.string().min(1).max(64),
  imageDigest: z.string().optional(),
  registryCredentialsSecret: z.string().optional(),
  pullPolicy: z.enum(['Always', 'IfNotPresent', 'Never']).default('IfNotPresent'),
  manifest: manifestSchema,
});

export const updatePluginSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  imageTag: z.string().min(1).max(64).optional(),
  imageDigest: z.string().optional(),
});

export const updateVisibilitySchema = z.object({
  workspaceId: z.string().uuid(),
  isEnabled: z.boolean(),
});

export const installPluginResponseSchema = z.object({
  installId: z.string().uuid(),
  status: z.string(),
  steps: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['pending', 'in_progress', 'done', 'failed']),
    })
  ),
});

export type RegisterPluginInput = z.infer<typeof registerPluginSchema>;
export type UpdateVisibilityInput = z.infer<typeof updateVisibilitySchema>;
