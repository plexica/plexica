// File: apps/core-api/src/lib/plugin-validator.ts

/**
 * Plugin validation utilities
 * Prevents path traversal and invalid plugin identifiers
 */

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
