import { z } from 'zod';

const WORKSPACE_ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const;

/**
 * Zod schema for updating a workspace member's role
 */
export const UpdateMemberRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES, { error: 'role must be one of: ADMIN, MEMBER, VIEWER' }),
});

/**
 * DTO type for updating a member's role (inferred from Zod schema)
 */
export type UpdateMemberRoleDto = z.infer<typeof UpdateMemberRoleSchema>;

/**
 * Fastify JSON Schema for request validation (used in route schema definitions)
 */
export const updateMemberRoleSchema = {
  type: 'object',
  required: ['role'],
  properties: {
    role: {
      type: 'string',
      enum: ['ADMIN', 'MEMBER', 'VIEWER'],
      description: 'New workspace role',
    },
  },
  additionalProperties: false,
};

/**
 * Validate UpdateMemberRoleDto using Zod
 * Returns an array of error messages (empty if valid)
 */
export function validateUpdateMemberRole(data: unknown): string[] {
  const result = UpdateMemberRoleSchema.safeParse(data);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.message);
}
