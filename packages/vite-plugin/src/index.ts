// index.ts
// @plexica/vite-plugin — Vite plugin for Plexica plugin development.
// Reads manifest.json and auto-configures Module Federation.
//
// Dev plugin registration uses HTTP via @plexica/sdk/dev registerBackend()
// (Decision 9, 2026-08-18 — the WebSocket-based dev-server-registration was
// removed as dead code: no WS broker was ever implemented).

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import federation from '@originjs/vite-plugin-federation';

import { generateMfConfig } from './mf-config-generator.js';
import { SHARED_DEPS } from './shared-deps.js';

import type { PluginManifest } from './manifest-types.js';
import type { Plugin } from 'vite';

export interface PlexicaPluginViteOptions {
  manifestPath?: string;
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

  return [
    federation({
      name: mfConfig.name,
      filename: mfConfig.filename,
      exposes: mfConfig.exposes,
      shared: SHARED_DEPS,
    }) as unknown as Plugin,
  ];
}

export { SHARED_DEPS, generateMfConfig };
export type { PluginManifest };
