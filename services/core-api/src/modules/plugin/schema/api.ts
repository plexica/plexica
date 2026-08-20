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

export const updateVisibilitySchema = z.object({
  workspaceId: z.string().uuid(),
  isEnabled: z.boolean(),
});

export const updateVisibilityListSchema = z.array(updateVisibilitySchema).min(1);

export type RegisterPluginInput = z.infer<typeof registerPluginSchema>;
