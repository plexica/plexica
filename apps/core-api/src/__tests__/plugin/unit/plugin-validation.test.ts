/**
 * Plugin Validation Tests (Phase 5, Task 5.3)
 *
 * Unit tests for plugin configuration validation, permission validation,
 * and dependency checking. Tests business logic for plugin manifest validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateConfigField,
  validatePermission,
  validateDependencies,
  validateManifestCompleteness,
} from '../../../lib/plugin-validator.js';
import type {
  PluginConfigField,
  PluginPermission,
  PluginDependencies,
  PluginManifest,
} from '../../../types/plugin.types';

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
