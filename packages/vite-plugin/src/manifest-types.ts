// manifest-types.ts
// TypeScript types for the plugin manifest structure.
// Mirrors the Zod schema from services/core-api/src/modules/plugin/schema/manifest.ts

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
