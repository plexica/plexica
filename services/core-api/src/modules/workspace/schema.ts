// schema.ts
// Zod validation schemas for Workspace module request bodies and queries.

import { z } from 'zod';

import { SLUG_REGEX } from '../../lib/slug.js';
import { paginationSchema } from '../../lib/pagination.js';

// Re-export to allow future consumers to reference it
export { SLUG_REGEX };

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const reparentSchema = z.object({
  newParentId: z.string().uuid().nullable(),
});

export const workspaceListQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'archived']).optional(),
  search: z.string().max(255).optional(),
  sort: z.enum(['name', 'createdAt']).optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  structure: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        defaultRoles: z.object({ creator: z.string() }),
      })
    )
    .default([]),
});
