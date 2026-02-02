/**
 * Plugin Manifest Validation Schema (M2.3)
 *
 * Zod schemas for validating plugin manifest structure,
 * especially the new API communication section.
 */

import { z } from 'zod';

/**
 * Validates semver version format (e.g., "1.0.0")
 */
const SemverVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9\-\.]+)?(\+[a-zA-Z0-9\-\.]+)?$/, {
    message: 'Must be a valid semver version (e.g., "1.0.0", "1.2.3-beta.1")',
  });

/**
 * Validates semver constraint (e.g., "^1.0.0", ">=2.0.0", "~1.2.3")
 */
const SemverConstraintSchema = z
  .string()
  .regex(
    /^(\^|~|>=|>|<=|<|=)?\d+\.\d+\.\d+(-[a-zA-Z0-9\-\.]+)?(\s*\|\|\s*(\^|~|>=|>|<=|<|=)?\d+\.\d+\.\d+(-[a-zA-Z0-9\-\.]+)?)*$/,
    { message: 'Must be a valid semver constraint (e.g., "^1.0.0", ">=2.0.0")' }
  );

/**
 * Validates plugin service name format: {plugin}.{resource}
 * Examples: "crm.contacts", "analytics.reports"
 */
const ServiceNameSchema = z.string().regex(/^[a-z0-9\-]+\.[a-z0-9\-]+$/, {
  message: 'Service name must follow pattern: {plugin}.{resource} (e.g., "crm.contacts")',
});

/**
 * Validates plugin ID format: plugin-{name}
 */
const PluginIdSchema = z
  .string()
  .regex(/^plugin-[a-z0-9\-]+$/, { message: 'Plugin ID must follow pattern: plugin-{name}' });

/**
 * Plugin API Endpoint Schema
 */
export const PluginApiEndpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().regex(/^\/[a-zA-Z0-9\-_\/:\*]*/, {
    message: 'Path must start with / and contain valid URL characters',
  }),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * Plugin API Service Schema (M2.3)
 * Defines a service that the plugin exposes to other plugins
 */
export const PluginApiServiceSchema = z
  .object({
    name: ServiceNameSchema,
    version: SemverVersionSchema,
    baseUrl: z.string().url().optional(),
    description: z.string().max(500).optional(),
    endpoints: z
      .array(PluginApiEndpointSchema)
      .min(1, { message: 'Service must have at least one endpoint' }),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .strict();

/**
 * Plugin API Dependency Schema (M2.3)
 * Declares that this plugin depends on another plugin's API
 */
export const PluginApiDependencySchema = z
  .object({
    pluginId: PluginIdSchema,
    serviceName: ServiceNameSchema.optional(),
    version: SemverConstraintSchema,
    required: z.boolean(),
    reason: z.string().max(500).optional(),
  })
  .strict();

/**
 * Plugin API Section Schema (M2.3)
 */
export const PluginManifestApiSchema = z
  .object({
    services: z.array(PluginApiServiceSchema).optional(),
    dependencies: z.array(PluginApiDependencySchema).optional(),
  })
  .strict();

/**
 * Plugin Configuration Field Schema
 */
const PluginConfigFieldSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  type: z.enum(['string', 'number', 'boolean', 'select', 'text', 'password', 'json']),
  default: z.any().optional(),
  defaultValue: z.any().optional(),
  required: z.boolean().optional(),
  description: z.string().optional(),
  options: z
    .array(
      z.object({
        value: z.any(),
        label: z.string(),
      })
    )
    .optional(),
});

/**
 * Plugin Permission Schema
 */
const PluginPermissionSchema = z.object({
  resource: z.string(),
  action: z.string(),
  description: z.string(),
});

/**
 * Plugin Navigation Item Schema
 */
const PluginNavigationItemSchema = z.object({
  label: z.string(),
  path: z.string(),
  icon: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

/**
 * Complete Plugin Manifest Schema
 */
export const PluginManifestSchema = z.object({
  // Basic Info
  id: PluginIdSchema,
  name: z.string().min(1).max(100),
  version: SemverVersionSchema,
  description: z.string().max(1000),
  category: z.string().optional(),

  // Author can be string or nested in metadata
  author: z.string().max(200).optional(),
  license: z.string().max(50).optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),

  // NEW: API Communication (M2.3)
  api: PluginManifestApiSchema.optional(),

  // Plugin Configuration (both 'config' and 'configuration' supported)
  config: z.array(PluginConfigFieldSchema).optional(),
  configuration: z.array(PluginConfigFieldSchema).optional(),

  // Permissions
  permissions: z.array(PluginPermissionSchema).optional(),

  // UI Integration
  navigation: z.array(PluginNavigationItemSchema).optional(),

  // Entry Points (both flat and nested formats supported)
  backend: z.any().optional(), // Can be string or complex object
  frontend: z.any().optional(), // Can be string or complex object
  entryPoints: z
    .object({
      backend: z.any().optional(),
      frontend: z.any().optional(),
    })
    .optional(),

  // Dependencies (npm packages, not plugins)
  dependencies: z.record(z.string(), z.string()).optional(),

  // Lifecycle hooks
  lifecycle: z
    .object({
      install: z.string().optional(),
      uninstall: z.string().optional(),
      activate: z.string().optional(),
      deactivate: z.string().optional(),
      update: z.string().optional(),
    })
    .optional(),
  hooks: z
    .object({
      onInstall: z.string().optional(),
      onUninstall: z.string().optional(),
      onEnable: z.string().optional(),
      onDisable: z.string().optional(),
      onUpdate: z.string().optional(),
    })
    .optional(),

  // Metadata
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * Type exports for TypeScript usage
 */
export type PluginApiEndpoint = z.infer<typeof PluginApiEndpointSchema>;
export type PluginApiService = z.infer<typeof PluginApiServiceSchema>;
export type PluginApiDependency = z.infer<typeof PluginApiDependencySchema>;
export type PluginManifestApi = z.infer<typeof PluginManifestApiSchema>;
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/**
 * Validation helper function
 */
export function validatePluginManifest(manifest: unknown): {
  valid: boolean;
  data?: PluginManifest;
  errors?: Array<{ path: string; message: string }>;
} {
  try {
    const result = PluginManifestSchema.safeParse(manifest);

    if (result.success) {
      return { valid: true, data: result.data };
    }

    const errors = result.error.issues.map((err: z.ZodIssue) => ({
      path: err.path.join('.'),
      message: err.message,
    }));

    return { valid: false, errors };
  } catch {
    return {
      valid: false,
      errors: [{ path: 'manifest', message: 'Invalid manifest format' }],
    };
  }
}

/**
 * Validate just the API section of a manifest
 */
export function validatePluginApiSection(api: unknown): {
  valid: boolean;
  data?: PluginManifestApi;
  errors?: Array<{ path: string; message: string }>;
} {
  try {
    const result = PluginManifestApiSchema.safeParse(api);

    if (result.success) {
      return { valid: true, data: result.data };
    }

    const errors = result.error.issues.map((err: z.ZodIssue) => ({
      path: err.path.join('.'),
      message: err.message,
    }));

    return { valid: false, errors };
  } catch {
    return {
      valid: false,
      errors: [{ path: 'api', message: 'Invalid API section format' }],
    };
  }
}
