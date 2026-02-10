import { z } from 'zod';

/**
 * Zod schema for updating a workspace
 */
export const UpdateWorkspaceSchema = z
  .object({
    name: z
      .string()
      .min(2, 'name must be between 2 and 100 characters')
      .max(100, 'name must be between 2 and 100 characters')
      .optional(),
    description: z.string().max(500, 'description must not exceed 500 characters').optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined || data.description !== undefined || data.settings !== undefined,
    { message: 'At least one field (name, description, or settings) must be provided' }
  );

/**
 * DTO type for updating a workspace (inferred from Zod schema)
 */
export type UpdateWorkspaceDto = z.infer<typeof UpdateWorkspaceSchema>;

/**
 * Fastify JSON Schema for request validation (used in route schema definitions)
 */
export const updateWorkspaceSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      description: 'Workspace display name',
    },
    description: {
      type: 'string',
      maxLength: 500,
      description: 'Workspace description',
    },
    settings: {
      type: 'object',
      description: 'Workspace settings (JSON)',
    },
  },
  additionalProperties: false,
};

/**
 * Validate UpdateWorkspaceDto using Zod
 * Returns an array of error messages (empty if valid)
 */
export function validateUpdateWorkspace(data: unknown): string[] {
  const result = UpdateWorkspaceSchema.safeParse(data);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.message);
}
