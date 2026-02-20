import { z } from 'zod';

/**
 * Zod schema for creating a new workspace
 */
export const CreateWorkspaceSchema = z.object({
  slug: z
    .string({ error: 'slug is required and must be a string' })
    .min(2, 'slug must be between 2 and 50 characters')
    .max(50, 'slug must be between 2 and 50 characters')
    .regex(/^[a-z0-9-]+$/, 'slug must contain only lowercase letters, numbers, and hyphens'),
  name: z
    .string({ error: 'name is required and must be a string' })
    .min(2, 'name must be between 2 and 100 characters')
    .max(100, 'name must be between 2 and 100 characters'),
  description: z.string().max(500, 'description must not exceed 500 characters').optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  /** Optional parent workspace ID. When provided the new workspace becomes a child. */
  parentId: z.string().uuid('parentId must be a valid UUID').optional(),
  /** Optional template ID to apply on workspace creation (Phase 2). */
  templateId: z.string().uuid('templateId must be a valid UUID').optional(),
});

/**
 * DTO type for creating a new workspace (inferred from Zod schema)
 */
export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceSchema>;

/**
 * Fastify JSON Schema for request validation (used in route schema definitions)
 */
export const createWorkspaceSchema = {
  type: 'object',
  required: ['slug', 'name'],
  properties: {
    slug: {
      type: 'string',
      minLength: 2,
      maxLength: 50,
      pattern: '^[a-z0-9-]+$',
      description: 'Unique workspace identifier (lowercase, alphanumeric + hyphens)',
    },
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      description: 'Workspace display name',
    },
    description: {
      type: 'string',
      maxLength: 500,
      description: 'Optional workspace description',
    },
    settings: {
      type: 'object',
      description: 'Optional workspace settings (JSON)',
    },
    parentId: {
      type: 'string',
      format: 'uuid',
      description: 'Optional parent workspace ID (creates child workspace)',
    },
    templateId: {
      type: 'string',
      format: 'uuid',
      description: 'Optional workspace template ID to apply on creation (Phase 2)',
    },
  },
  additionalProperties: false,
};

/**
 * Validate CreateWorkspaceDto using Zod
 * Returns an array of error messages (empty if valid)
 */
export function validateCreateWorkspace(data: unknown): string[] {
  const result = CreateWorkspaceSchema.safeParse(data);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.message);
}
