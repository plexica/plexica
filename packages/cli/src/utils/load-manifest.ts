// File: packages/cli/src/utils/load-manifest.ts

import fs from 'fs-extra';
import path from 'path';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  routes: Array<{
    path: string;
    componentName: string;
    title: string;
    layout?: 'default' | 'fullscreen' | 'minimal';
    permissions?: string[];
  }>;
  menuItems: Array<{
    id: string;
    label: string;
    icon?: string;
    path?: string;
    permissions?: string[];
    order?: number;
    children?: any[];
  }>;
  permissions?: string[];
}

/**
 * Load manifest from dist/manifest.json (created during publish prep)
 * or extract from source manifest.ts
 */
export async function loadManifest(dir: string): Promise<PluginManifest | null> {
  // First try manifest.json in dist (if already exported)
  const jsonPath = path.join(dir, 'dist', 'manifest.json');
  if (await fs.pathExists(jsonPath)) {
    try {
      const manifest = await fs.readJson(jsonPath);
      return manifest as PluginManifest;
    } catch {
      // Fall through to try source
    }
  }

  // Try to read from source TypeScript file
  const srcManifestPath = path.join(dir, 'src', 'manifest.ts');
  if (!(await fs.pathExists(srcManifestPath))) {
    console.error('Manifest not found in dist or src');
    return null;
  }

  try {
    // Read the source file and extract the manifest object
    const content = await fs.readFile(srcManifestPath, 'utf-8');

    // Simple regex to extract the manifest export
    // This is a basic parser - for production you'd want a proper AST parser
    const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
    const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/);
    const versionMatch = content.match(/version:\s*['"]([^'"]+)['"]/);
    const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/);
    const authorMatch = content.match(/author:\s*['"]([^'"]+)['"]/);

    if (!idMatch || !nameMatch || !versionMatch) {
      console.error('Missing required manifest fields (id, name, version)');
      return null;
    }

    return {
      id: idMatch[1],
      name: nameMatch[1],
      version: versionMatch[1],
      description: descMatch ? descMatch[1] : '',
      author: authorMatch ? authorMatch[1] : '',
      routes: [],
      menuItems: [],
    };
  } catch (error: any) {
    console.error('Failed to load manifest:', error.message);
    return null;
  }
}

/**
 * Export manifest to JSON for easier loading
 */
export async function exportManifestJson(dir: string): Promise<boolean> {
  const manifest = await loadManifest(dir);
  if (!manifest) {
    return false;
  }

  const jsonPath = path.join(dir, 'dist', 'manifest.json');
  await fs.writeJson(jsonPath, manifest, { spaces: 2 });
  return true;
}
