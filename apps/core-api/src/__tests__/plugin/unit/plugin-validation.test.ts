/**
 * Plugin Validation Tests (Phase 5, Task 5.3)
 *
 * Unit tests for plugin configuration validation, permission validation,
 * and dependency checking. Tests business logic for plugin manifest validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  PluginConfigField,
  PluginPermission,
  PluginDependencies,
  PluginManifest,
} from '../../../types/plugin.types';

/**
 * Validates a plugin configuration field definition
 */
function validateConfigField(field: PluginConfigField): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required properties
  if (!field.key || typeof field.key !== 'string') {
    errors.push('Config field must have a valid "key" string');
  }

  if (!field.type) {
    errors.push('Config field must have a "type"');
  }

  const validTypes = ['string', 'number', 'boolean', 'select', 'multiselect', 'json'];
  if (field.type && !validTypes.includes(field.type)) {
    errors.push(`Config field type must be one of: ${validTypes.join(', ')}`);
  }

  if (!field.label || typeof field.label !== 'string') {
    errors.push('Config field must have a valid "label" string');
  }

  // Validate select/multiselect options
  if ((field.type === 'select' || field.type === 'multiselect') && !field.options) {
    errors.push(`Config field of type "${field.type}" must have "options" array`);
  }

  if (field.options) {
    if (!Array.isArray(field.options)) {
      errors.push('Config field "options" must be an array');
    } else {
      field.options.forEach((opt, idx) => {
        if (!opt.value || !opt.label) {
          errors.push(`Config field option at index ${idx} must have "value" and "label"`);
        }
      });
    }
  }

  // Validate default value type
  if (field.default !== undefined) {
    const defaultType = typeof field.default;
    if (field.type === 'string' && defaultType !== 'string') {
      errors.push('Default value for string field must be a string');
    }
    if (field.type === 'number' && defaultType !== 'number') {
      errors.push('Default value for number field must be a number');
    }
    if (field.type === 'boolean' && defaultType !== 'boolean') {
      errors.push('Default value for boolean field must be a boolean');
    }
  }

  // Validate number field constraints
  if (field.type === 'number' && field.validation) {
    if (field.validation.min !== undefined && field.validation.max !== undefined) {
      if (field.validation.min > field.validation.max) {
        errors.push('Validation min must be less than or equal to max');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a plugin permission definition
 */
function validatePermission(permission: PluginPermission): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!permission.resource || typeof permission.resource !== 'string') {
    errors.push('Permission must have a valid "resource" string');
  }

  if (!permission.action || typeof permission.action !== 'string') {
    errors.push('Permission must have a valid "action" string');
  }

  if (!permission.description || typeof permission.description !== 'string') {
    errors.push('Permission must have a valid "description" string');
  }

  // Validate resource format (should be lowercase, alphanumeric with hyphens)
  if (permission.resource && !/^[a-z0-9\-]+$/.test(permission.resource)) {
    errors.push('Permission resource must be lowercase alphanumeric with hyphens');
  }

  // Validate action format (should be lowercase, alphanumeric)
  if (permission.action && !/^[a-z]+$/.test(permission.action)) {
    errors.push('Permission action must be lowercase alphabetic');
  }

  // Common actions validation
  const validActions = ['read', 'write', 'create', 'update', 'delete', 'manage', 'execute'];
  if (permission.action && !validActions.includes(permission.action)) {
    errors.push(`Permission action should be one of: ${validActions.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates plugin dependencies for conflicts and cycles
 */
function validateDependencies(
  pluginId: string,
  dependencies: PluginDependencies,
  allPlugins: Map<string, PluginManifest>
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate required dependencies exist
  if (dependencies.required) {
    Object.keys(dependencies.required).forEach((depId) => {
      if (!allPlugins.has(depId)) {
        errors.push(`Required dependency "${depId}" not found in plugin registry`);
      }
    });
  }

  // Validate optional dependencies exist
  if (dependencies.optional) {
    Object.keys(dependencies.optional).forEach((depId) => {
      if (!allPlugins.has(depId)) {
        errors.push(`Optional dependency "${depId}" not found in plugin registry`);
      }
    });
  }

  // Check for conflicts
  if (dependencies.conflicts) {
    dependencies.conflicts.forEach((conflictId) => {
      // Check if plugin depends on a conflicting plugin
      if (dependencies.required && dependencies.required[conflictId]) {
        errors.push(`Plugin cannot both require and conflict with "${conflictId}"`);
      }
      if (dependencies.optional && dependencies.optional[conflictId]) {
        errors.push(`Plugin cannot both optionally depend on and conflict with "${conflictId}"`);
      }
    });
  }

  // Check for circular dependencies (simplified - only direct cycles)
  if (dependencies.required) {
    Object.keys(dependencies.required).forEach((depId) => {
      const depPlugin = allPlugins.get(depId);
      if (depPlugin?.dependencies?.required?.[pluginId]) {
        errors.push(`Circular dependency detected between "${pluginId}" and "${depId}"`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates plugin manifest completeness
 */
function validateManifestCompleteness(manifest: Partial<PluginManifest>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const requiredFields = ['id', 'name', 'version', 'description', 'category', 'metadata'];

  requiredFields.forEach((field) => {
    if (!manifest[field as keyof PluginManifest]) {
      errors.push(`Manifest is missing required field: ${field}`);
    }
  });

  // Validate metadata structure
  if (manifest.metadata) {
    if (!manifest.metadata.author) {
      errors.push('Manifest metadata must include author information');
    }
    if (!manifest.metadata.license) {
      errors.push('Manifest metadata must include license information');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

describe('Plugin Validation Tests', () => {
  describe('validateConfigField', () => {
    describe('basic field validation', () => {
      it('should validate a valid string config field', () => {
        const field: PluginConfigField = {
          key: 'apiKey',
          type: 'string',
          label: 'API Key',
          description: 'Your API key',
          required: true,
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate a valid number config field', () => {
        const field: PluginConfigField = {
          key: 'timeout',
          type: 'number',
          label: 'Timeout (seconds)',
          default: 30,
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate a valid boolean config field', () => {
        const field: PluginConfigField = {
          key: 'enabled',
          type: 'boolean',
          label: 'Enable Feature',
          default: false,
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject field without key', () => {
        const field: any = {
          type: 'string',
          label: 'Test',
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Config field must have a valid "key" string');
      });

      it('should reject field without type', () => {
        const field: any = {
          key: 'test',
          label: 'Test',
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Config field must have a "type"');
      });

      it('should reject field without label', () => {
        const field: any = {
          key: 'test',
          type: 'string',
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Config field must have a valid "label" string');
      });

      it('should reject field with invalid type', () => {
        const field: any = {
          key: 'test',
          type: 'invalid-type',
          label: 'Test',
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('must be one of'))).toBe(true);
      });
    });

    describe('select field validation', () => {
      it('should validate select field with options', () => {
        const field: PluginConfigField = {
          key: 'region',
          type: 'select',
          label: 'Region',
          options: [
            { value: 'us', label: 'United States' },
            { value: 'eu', label: 'Europe' },
          ],
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject select field without options', () => {
        const field: any = {
          key: 'region',
          type: 'select',
          label: 'Region',
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Config field of type "select" must have "options" array');
      });

      it('should reject select field with invalid options', () => {
        const field: any = {
          key: 'region',
          type: 'select',
          label: 'Region',
          options: [
            { value: 'us' }, // Missing label
            { label: 'Europe' }, // Missing value
          ],
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('default value validation', () => {
      it('should accept matching default value types', () => {
        const fields: PluginConfigField[] = [
          { key: 'str', type: 'string', label: 'String', default: 'test' },
          { key: 'num', type: 'number', label: 'Number', default: 42 },
          { key: 'bool', type: 'boolean', label: 'Boolean', default: true },
        ];

        fields.forEach((field) => {
          const result = validateConfigField(field);
          expect(result.valid).toBe(true);
        });
      });

      it('should reject mismatched default value for string', () => {
        const field: any = {
          key: 'test',
          type: 'string',
          label: 'Test',
          default: 123,
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Default value for string field must be a string');
      });

      it('should reject mismatched default value for number', () => {
        const field: any = {
          key: 'test',
          type: 'number',
          label: 'Test',
          default: 'not-a-number',
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Default value for number field must be a number');
      });

      it('should reject mismatched default value for boolean', () => {
        const field: any = {
          key: 'test',
          type: 'boolean',
          label: 'Test',
          default: 'true',
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Default value for boolean field must be a boolean');
      });
    });

    describe('number validation constraints', () => {
      it('should validate number field with min/max', () => {
        const field: PluginConfigField = {
          key: 'port',
          type: 'number',
          label: 'Port',
          validation: {
            min: 1,
            max: 65535,
          },
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(true);
      });

      it('should reject number field with min > max', () => {
        const field: PluginConfigField = {
          key: 'test',
          type: 'number',
          label: 'Test',
          validation: {
            min: 100,
            max: 10,
          },
        };

        const result = validateConfigField(field);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Validation min must be less than or equal to max');
      });
    });
  });

  describe('validatePermission', () => {
    it('should validate a valid permission', () => {
      const permission: PluginPermission = {
        resource: 'contacts',
        action: 'read',
        description: 'Read contact information',
      };

      const result = validatePermission(permission);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate all common CRUD actions', () => {
      const actions = ['read', 'write', 'create', 'update', 'delete', 'manage', 'execute'];

      actions.forEach((action) => {
        const permission: PluginPermission = {
          resource: 'data',
          action,
          description: `${action} data`,
        };

        const result = validatePermission(permission);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject permission without resource', () => {
      const permission: any = {
        action: 'read',
        description: 'Test',
      };

      const result = validatePermission(permission);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Permission must have a valid "resource" string');
    });

    it('should reject permission without action', () => {
      const permission: any = {
        resource: 'contacts',
        description: 'Test',
      };

      const result = validatePermission(permission);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Permission must have a valid "action" string');
    });

    it('should reject permission without description', () => {
      const permission: any = {
        resource: 'contacts',
        action: 'read',
      };

      const result = validatePermission(permission);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Permission must have a valid "description" string');
    });

    it('should reject permission with invalid resource format', () => {
      const permission: PluginPermission = {
        resource: 'Invalid Resource!', // Uppercase and special chars
        action: 'read',
        description: 'Test',
      };

      const result = validatePermission(permission);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Permission resource must be lowercase alphanumeric with hyphens'
      );
    });

    it('should reject permission with invalid action format', () => {
      const permission: PluginPermission = {
        resource: 'contacts',
        action: 'Read123', // Uppercase and numbers
        description: 'Test',
      };

      const result = validatePermission(permission);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('must be lowercase alphabetic'))).toBe(true);
    });

    it('should warn about non-standard actions', () => {
      const permission: PluginPermission = {
        resource: 'contacts',
        action: 'customaction',
        description: 'Custom action',
      };

      const result = validatePermission(permission);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('should be one of'))).toBe(true);
    });
  });

  describe('validateDependencies', () => {
    let allPlugins: Map<string, PluginManifest>;

    beforeEach(() => {
      allPlugins = new Map();
      allPlugins.set('plugin-crm', {
        id: 'plugin-crm',
        name: 'CRM',
        version: '1.0.0',
        description: 'CRM plugin',
        category: 'crm' as any,
        metadata: { author: { name: 'Test' }, license: 'MIT' },
      });
      allPlugins.set('plugin-analytics', {
        id: 'plugin-analytics',
        name: 'Analytics',
        version: '1.0.0',
        description: 'Analytics plugin',
        category: 'analytics' as any,
        metadata: { author: { name: 'Test' }, license: 'MIT' },
      });
    });

    it('should validate dependencies when all exist', () => {
      const dependencies: PluginDependencies = {
        required: {
          'plugin-crm': '^1.0.0',
        },
        optional: {
          'plugin-analytics': '^1.0.0',
        },
      };

      const result = validateDependencies('plugin-test', dependencies, allPlugins);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject when required dependency not found', () => {
      const dependencies: PluginDependencies = {
        required: {
          'plugin-nonexistent': '^1.0.0',
        },
      };

      const result = validateDependencies('plugin-test', dependencies, allPlugins);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Required dependency "plugin-nonexistent" not found in plugin registry'
      );
    });

    it('should reject when optional dependency not found', () => {
      const dependencies: PluginDependencies = {
        optional: {
          'plugin-missing': '^1.0.0',
        },
      };

      const result = validateDependencies('plugin-test', dependencies, allPlugins);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Optional dependency "plugin-missing" not found in plugin registry'
      );
    });

    it('should reject plugin that requires and conflicts with same plugin', () => {
      const dependencies: PluginDependencies = {
        required: {
          'plugin-crm': '^1.0.0',
        },
        conflicts: ['plugin-crm'],
      };

      const result = validateDependencies('plugin-test', dependencies, allPlugins);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Plugin cannot both require and conflict with "plugin-crm"');
    });

    it('should reject circular dependencies', () => {
      // Plugin A depends on Plugin B
      const pluginB: PluginManifest = {
        id: 'plugin-b',
        name: 'Plugin B',
        version: '1.0.0',
        description: 'Plugin B',
        category: 'utility' as any,
        metadata: { author: { name: 'Test' }, license: 'MIT' },
        dependencies: {
          required: {
            'plugin-a': '^1.0.0', // B depends on A
          },
        },
      };
      allPlugins.set('plugin-b', pluginB);

      // Plugin A depends on Plugin B (circular!)
      const dependencies: PluginDependencies = {
        required: {
          'plugin-b': '^1.0.0',
        },
      };

      const result = validateDependencies('plugin-a', dependencies, allPlugins);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Circular dependency detected between "plugin-a" and "plugin-b"'
      );
    });

    it('should allow empty dependencies', () => {
      const dependencies: PluginDependencies = {};

      const result = validateDependencies('plugin-test', dependencies, allPlugins);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateManifestCompleteness', () => {
    it('should validate a complete manifest', () => {
      const manifest: PluginManifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        category: 'utility' as any,
        metadata: {
          author: {
            name: 'Test Author',
            email: 'test@example.com',
          },
          license: 'MIT',
        },
      };

      const result = validateManifestCompleteness(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject manifest missing required fields', () => {
      const manifest: Partial<PluginManifest> = {
        name: 'Test Plugin',
        version: '1.0.0',
        // Missing: id, description, category, metadata
      };

      const result = validateManifestCompleteness(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Manifest is missing required field: id');
      expect(result.errors).toContain('Manifest is missing required field: description');
      expect(result.errors).toContain('Manifest is missing required field: category');
      expect(result.errors).toContain('Manifest is missing required field: metadata');
    });

    it('should reject manifest with incomplete metadata', () => {
      const manifest: any = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'Test',
        category: 'utility',
        metadata: {
          // Missing: author, license
        },
      };

      const result = validateManifestCompleteness(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Manifest metadata must include author information');
      expect(result.errors).toContain('Manifest metadata must include license information');
    });

    it('should reject manifest without metadata', () => {
      const manifest: any = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'Test',
        category: 'utility',
      };

      const result = validateManifestCompleteness(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Manifest is missing required field: metadata');
    });
  });
});
