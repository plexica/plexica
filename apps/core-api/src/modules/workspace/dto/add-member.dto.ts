import { z } from 'zod';

const WORKSPACE_ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const;

/**
 * Zod schema for adding a member to a workspace
 */
export const AddMemberSchema = z.object({
  userId: z
    .string({ error: 'userId is required and must be a string' })
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'userId must be a valid UUID'
    ),
  role: z.enum(WORKSPACE_ROLES, { error: 'role must be one of: ADMIN, MEMBER, VIEWER' }).optional(),
});

/**
 * DTO type for adding a member (inferred from Zod schema)
 */
export type AddMemberDto = z.infer<typeof AddMemberSchema>;

/**
 * Fastify JSON Schema for request validation (used in route schema definitions)
 */
export const addMemberSchema = {
  type: 'object',
  required: ['userId'],
  properties: {
    userId: {
      type: 'string',
      format: 'uuid',
      description: 'User ID to add to workspace',
    },
    role: {
      type: 'string',
      enum: ['ADMIN', 'MEMBER', 'VIEWER'],
      description: 'Workspace role (default: MEMBER)',
    },
  },
  additionalProperties: false,
};

/**
 * Validate AddMemberDto using Zod
 * Returns an array of error messages (empty if valid)
 */
export function validateAddMember(data: unknown): string[] {
  const result = AddMemberSchema.safeParse(data);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.message);
}
