/**
 * DTO for adding a member to a workspace
 */
export interface AddMemberDto {
  userId: string;
  role?: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

/**
 * Validation schema for AddMemberDto
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
 * Validate AddMemberDto
 */
export function validateAddMember(data: any): string[] {
  const errors: string[] = [];

  if (!data.userId || typeof data.userId !== 'string') {
    errors.push('userId is required and must be a string');
  } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.userId)) {
    errors.push('userId must be a valid UUID');
  }

  if (data.role !== undefined) {
    if (!['ADMIN', 'MEMBER', 'VIEWER'].includes(data.role)) {
      errors.push('role must be one of: ADMIN, MEMBER, VIEWER');
    }
  }

  return errors;
}
