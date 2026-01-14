/**
 * DTO for updating a workspace
 */
export interface UpdateWorkspaceDto {
  name?: string;
  description?: string;
  settings?: Record<string, any>;
}

/**
 * Validation schema for UpdateWorkspaceDto
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
 * Validate UpdateWorkspaceDto
 */
export function validateUpdateWorkspace(data: any): string[] {
  const errors: string[] = [];

  if (data.name !== undefined) {
    if (typeof data.name !== 'string') {
      errors.push('name must be a string');
    } else if (data.name.length < 2 || data.name.length > 100) {
      errors.push('name must be between 2 and 100 characters');
    }
  }

  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      errors.push('description must be a string');
    } else if (data.description.length > 500) {
      errors.push('description must not exceed 500 characters');
    }
  }

  if (data.settings !== undefined && typeof data.settings !== 'object') {
    errors.push('settings must be an object');
  }

  // At least one field must be provided
  if (data.name === undefined && data.description === undefined && data.settings === undefined) {
    errors.push('At least one field (name, description, or settings) must be provided');
  }

  return errors;
}
