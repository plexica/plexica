// manifest-types.ts
// TypeScript types for the plugin manifest structure.
// Mirrors the Zod schema from services/core-api/src/modules/plugin/schema/manifest.ts

/**
 * Plugin manifest structure defining plugin metadata, capabilities, and UI extensions.
 * Must be present as manifest.json in every plugin project root.
 * Schema validation is performed by core-api during plugin registration.
 */
export interface PluginManifest {
  slug: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  categories?: string[];
  ui?: {
    remoteEntry?: string;
    extensionPoints: string[];
  };
  events?: {
    subscribes?: string[];
  };
  actions?: Array<{
    action: string;
    label: string;
    defaultRole: 'admin' | 'member' | 'viewer';
  }>;
  declaredTables?: Array<{
    name: string;
    migrationFile: string;
  }>;
}
