// apps/core-api/src/modules/plugin/dto/register-template.dto.ts
//
// Zod schema and DTO types for plugin-provided template registration.
// Implements Spec 011 Phase 3 — T011-15, FR-028.
//
// Used by:
//   - POST   /api/plugins/:pluginId/templates
//   - PUT    /api/plugins/:pluginId/templates/:templateId

import { z } from 'zod';

/**
 * Discriminated union of the three template item types:
 *   - plugin  : enables a workspace plugin
 *   - setting : sets a workspace-level setting key/value
 *   - page    : scaffolds a workspace page with a given slug and title
 */
export const TemplateItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('plugin'),
    pluginId: z.string().min(1),
    sortOrder: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('setting'),
    settingKey: z.string().min(1).max(255),
    settingValue: z.unknown(),
    sortOrder: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('page'),
    pageConfig: z.object({
      slug: z
        .string()
        .min(2)
        .max(50)
        .regex(/^[a-z0-9-]+$/),
      title: z.string().min(1).max(200),
      layout: z.string().optional(),
    }),
    sortOrder: z.number().int().min(0).optional(),
  }),
]);

/**
 * Request body schema for registering or replacing a plugin-provided template.
 * Maximum 50 items per template (FR-028).
 */
export const RegisterTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  items: z.array(TemplateItemSchema).min(0).max(50),
});

export type TemplateItemDto = z.infer<typeof TemplateItemSchema>;
export type RegisterTemplateDto = z.infer<typeof RegisterTemplateSchema>;
