// index.ts
// @plexica/vite-plugin — Vite plugin for Plexica plugin development.
// Reads manifest.json and auto-configures Module Federation.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import federation from '@originjs/vite-plugin-federation';

import { generateMfConfig } from './mf-config-generator.js';
import { SHARED_DEPS } from './shared-deps.js';
import { devServerRegistration } from './dev-server-registration.js';

import type { PluginManifest } from './manifest-types.js';
import type { Plugin } from 'vite';

export interface PlexicaPluginViteOptions {
  manifestPath?: string;
  devMode?: boolean;
  devServerPort?: number;
  shellWsUrl?: string;
}

export default function plexicaPluginVite(options: PlexicaPluginViteOptions = {}): Plugin[] {
  const manifestPath = resolve(options.manifestPath ?? './manifest.json');

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Plugin manifest not found at ${manifestPath}. ` +
        'Run create-plexica-plugin to scaffold a plugin project.'
    );
  }

  const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const mfConfig = generateMfConfig(manifest, SHARED_DEPS);
  const plugins: Plugin[] = [];

  // Module Federation plugin (production build)
  plugins.push(
    federation({
      name: mfConfig.name,
      filename: mfConfig.filename,
      exposes: mfConfig.exposes,
      shared: SHARED_DEPS,
    }) as unknown as Plugin
  );

  // Dev server registration (development only)
  if (options.devMode ?? process.env['NODE_ENV'] === 'development') {
    plugins.push(
      devServerRegistration({
        slug: manifest.slug,
        remoteEntry: `http://localhost:${options.devServerPort ?? 4001}/${mfConfig.filename}`,
        extensionPoints: manifest.ui?.extensionPoints ?? [],
        shellWsUrl: options.shellWsUrl ?? 'ws://localhost:3000/_plexica/dev-ws',
      })
    );
  }

  return plugins;
}

export { SHARED_DEPS, generateMfConfig };
export type { PluginManifest };
