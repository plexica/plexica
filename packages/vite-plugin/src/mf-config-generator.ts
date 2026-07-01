// mf-config-generator.ts
// Reads a plugin's manifest.json and generates Module Federation config.

import type { PluginManifest } from './manifest-types.js';

export interface MfConfig {
  name: string;
  filename: string;
  exposes: Record<string, string>;
  shared: Record<string, unknown>;
}

/**
 * Generates Module Federation config from a plugin manifest.
 * Maps ui.extensionPoints to MF exposes entries by convention:
 *   "sidebar:admin" → "./sidebar:admin" → "./ui/sidebar-entry.tsx"
 */
export function generateMfConfig(
  manifest: PluginManifest,
  sharedDeps: Record<string, unknown>
): MfConfig {
  const exposes: Record<string, string> = {};

  for (const point of manifest.ui?.extensionPoints ?? []) {
    // Convert "sidebar:admin" → "./sidebar:admin" mapped to conventional file path
    const safeName = point.replace(/:/g, '-');
    exposes[`./${point}`] = `./ui/${safeName}.tsx`;
  }

  return {
    name: manifest.slug,
    filename: manifest.ui?.remoteEntry ?? 'remoteEntry.js',
    exposes,
    shared: sharedDeps,
  };
}
