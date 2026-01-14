/**
 * DTO for updating a workspace member's role
 */
export interface UpdateMemberRoleDto {
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

/**
 * Validation schema for UpdateMemberRoleDto
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
 * Validate UpdateMemberRoleDto
 */
export function validateUpdateMemberRole(data: any): string[] {
  const errors: string[] = [];

  if (!data.role) {
    errors.push('role is required');
  } else if (!['ADMIN', 'MEMBER', 'VIEWER'].includes(data.role)) {
    errors.push('role must be one of: ADMIN, MEMBER, VIEWER');
  }

  return errors;
}
