import { z } from 'zod';

/**
 * Zod schema for sharing a resource with a workspace
 */
export const ShareResourceSchema = z.object({
  resourceType: z
    .string({ error: 'resourceType is required and must be a string' })
    .min(1, 'resourceType cannot be empty')
    .max(100, 'resourceType cannot exceed 100 characters')
    .regex(
      /^[a-z0-9][a-z0-9\-_]*[a-z0-9]$/,
      'resourceType must contain only lowercase alphanumeric characters, hyphens, and underscores'
    ),
  resourceId: z
    .string({ error: 'resourceId is required and must be a string' })
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'resourceId must be a valid UUID'
    ),
});

/**
 * DTO type for sharing a resource (inferred from Zod schema)
 */
export type ShareResourceDto = z.infer<typeof ShareResourceSchema>;

/**
 * Fastify JSON Schema for request validation (used in route schema definitions)
 */
export const shareResourceSchema = {
  type: 'object',
  required: ['resourceType', 'resourceId'],
  properties: {
    resourceType: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^[a-z0-9][a-z0-9\\-_]*[a-z0-9]$',
      description:
        'Type of resource to share (e.g., "plugin", "template", "dataset"). Must contain only lowercase alphanumeric characters, hyphens, and underscores.',
      examples: ['plugin', 'template', 'dataset', 'custom-resource'],
    },
    resourceId: {
      type: 'string',
      format: 'uuid',
      description: 'Unique identifier of the resource to share',
      examples: ['550e8400-e29b-41d4-a716-446655440000'],
    },
  },
  additionalProperties: false,
};

/**
 * Zod schema for listing shared resources (query parameters)
 */
export const ListSharedResourcesSchema = z.object({
  resourceType: z.string().optional(),
  limit: z
    .string()
    .optional()
    .default('50')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 100, {
      message: 'limit must be between 1 and 100',
    }),
  offset: z
    .string()
    .optional()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 0, {
      message: 'offset must be a non-negative integer',
    }),
});

/**
 * DTO type for listing shared resources (inferred from Zod schema)
 */
export type ListSharedResourcesDto = z.infer<typeof ListSharedResourcesSchema>;

/**
 * Fastify JSON Schema for query string validation
 */
export const listSharedResourcesSchema = {
  type: 'object',
  properties: {
    resourceType: {
      type: 'string',
      description: 'Filter by resource type (optional)',
      examples: ['plugin', 'template', 'dataset'],
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 50,
      description: 'Maximum number of results to return',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      default: 0,
      description: 'Number of results to skip (for pagination)',
    },
  },
  additionalProperties: false,
};

/**
 * Validate ShareResourceDto using Zod
 * Returns an array of error messages (empty if valid)
 */
export function validateShareResource(data: unknown): string[] {
  const result = ShareResourceSchema.safeParse(data);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.message);
}

/**
 * Validate ListSharedResourcesDto using Zod
 * Returns an array of error messages (empty if valid)
 */
export function validateListSharedResources(data: unknown): string[] {
  const result = ListSharedResourcesSchema.safeParse(data);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.message);
}
