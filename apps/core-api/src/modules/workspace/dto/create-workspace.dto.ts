/**
 * DTO for creating a new workspace
 */
export interface CreateWorkspaceDto {
  slug: string;
  name: string;
  description?: string;
  settings?: Record<string, any>;
}

/**
 * Validation schema for CreateWorkspaceDto
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
  },
  additionalProperties: false,
};

/**
 * Validate CreateWorkspaceDto
 */
export function validateCreateWorkspace(data: any): string[] {
  const errors: string[] = [];

  if (!data.slug || typeof data.slug !== 'string') {
    errors.push('slug is required and must be a string');
  } else if (data.slug.length < 2 || data.slug.length > 50) {
    errors.push('slug must be between 2 and 50 characters');
  } else if (!/^[a-z0-9-]+$/.test(data.slug)) {
    errors.push('slug must contain only lowercase letters, numbers, and hyphens');
  }

  if (!data.name || typeof data.name !== 'string') {
    errors.push('name is required and must be a string');
  } else if (data.name.length < 2 || data.name.length > 100) {
    errors.push('name must be between 2 and 100 characters');
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

  return errors;
}
