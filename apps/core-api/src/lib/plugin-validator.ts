// File: apps/core-api/src/lib/plugin-validator.ts

/**
 * Plugin validation utilities
 * Validates plugin identifiers, config fields, permissions, dependencies,
 * and manifest completeness. Prevents path traversal and invalid input.
 */

import type {
  PluginConfigField,
  PluginPermission,
  PluginDependencies,
  PluginManifest,
} from '../types/plugin.types.js';

/**
 * Validates plugin ID format
 * - Must be alphanumeric (lowercase) with hyphens
 * - Cannot start or end with hyphen
 * - Length 3-64 characters
 * - Examples: my-plugin, plugin-v2, analytics-tool
 */
export function validatePluginId(pluginId: string): { valid: boolean; error?: string } {
  if (!pluginId) {
    return { valid: false, error: 'Plugin ID is required' };
  }

  if (typeof pluginId !== 'string') {
    return { valid: false, error: 'Plugin ID must be a string' };
  }

  // Trim whitespace
  const trimmed = pluginId.trim();

  // Check length
  if (trimmed.length < 3 || trimmed.length > 64) {
    return { valid: false, error: 'Plugin ID must be between 3 and 64 characters' };
  }

  // Pattern: alphanumeric (lowercase) + hyphens, no leading/trailing hyphens
  const pattern = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;
  if (!pattern.test(trimmed)) {
    return {
      valid: false,
      error: 'Plugin ID must be lowercase alphanumeric with hyphens, no leading/trailing hyphens',
    };
  }

  // Prevent path traversal attempts
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return { valid: false, error: 'Plugin ID contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validates semantic version format (semver)
 * Accepts: 1.0.0, 2.1.3, 0.0.1-alpha, 1.0.0-rc.1, etc.
 * Rejects: v1.0.0, 1.0, 1.x.x, 1.0.0.0, etc.
 */
export function validatePluginVersion(version: string): { valid: boolean; error?: string } {
  if (!version) {
    return { valid: false, error: 'Plugin version is required' };
  }

  if (typeof version !== 'string') {
    return { valid: false, error: 'Plugin version must be a string' };
  }

  // Trim whitespace
  const trimmed = version.trim();

  // Basic semver pattern: MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
  // Examples: 1.0.0, 2.1.3, 1.0.0-alpha, 1.0.0-rc.1, 1.0.0+build.1
  const semverPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

  if (!semverPattern.test(trimmed)) {
    return { valid: false, error: 'Plugin version must follow semantic versioning (e.g., 1.0.0)' };
  }

  // Prevent path traversal attempts
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return { valid: false, error: 'Plugin version contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validates both plugin ID and version together
 * Useful for route parameter validation
 */
export function validatePluginIdentifier(
  pluginId: string,
  version: string
): { valid: boolean; error?: string } {
  const idValidation = validatePluginId(pluginId);
  if (!idValidation.valid) {
    return idValidation;
  }

  const versionValidation = validatePluginVersion(version);
  if (!versionValidation.valid) {
    return versionValidation;
  }

  return { valid: true };
}

/**
 * Validates a plugin configuration field definition.
 * Checks required properties (key, type, label), type validity,
 * select/multiselect options, default value type matching, and
 * number field min/max constraints.
 */
export function validateConfigField(field: PluginConfigField): {
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
 * Validates a plugin permission definition.
 * Checks required properties (resource, action, description),
 * resource format (lowercase alphanumeric with hyphens),
 * action format (lowercase alphabetic), and action against known set.
 */
export function validatePermission(permission: PluginPermission): {
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
 * Validates plugin dependencies for conflicts and cycles.
 * Checks that required/optional dependencies exist in the plugin registry,
 * detects require+conflict contradictions, and finds direct circular dependencies.
 */
export function validateDependencies(
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
 * Validates plugin manifest completeness.
 * Checks that all required top-level fields (id, name, version, description,
 * category, metadata) are present and that metadata includes author and license.
 */
export function validateManifestCompleteness(manifest: Partial<PluginManifest>): {
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
