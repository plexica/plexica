// src/index.ts
// @plexica/vite-plugin — Vite plugin for Plexica plugin development.
// Reads manifest.json and auto-configures Module Federation.
//
// Dev plugin registration uses HTTP via @plexica/sdk/dev registerBackend()
// (Decision 9, 2026-08-18 — the WebSocket-based dev-server-registration was
// removed as dead code: no WS broker was ever implemented).

import { readFileSync, existsSync, cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import federation from '@originjs/vite-plugin-federation';

import { generateMfConfig } from './mf-config-generator.js';
import { SHARED_DEPS } from './shared-deps.js';

import type { PluginManifest } from './manifest-types.js';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Options for configuring the Plexica Vite plugin.
 */
export interface PlexicaPluginViteOptions {
  manifestPath?: string;
}

/**
 * Copies the plugin's `i18n/*.json` bundles (006-09) next to `remoteEntry.js`
 * so the shell can fetch `i18n/{locale}.json` from the MF remote asset base.
 * No bundles declared → no-op. A failed copy fails the build loudly (a plugin
 * declaring bundles MUST ship them — otherwise the shell's validation guard
 * still applies at fetch time).
 */
function copyI18nBundles(pluginRoot: string, config: ResolvedConfig): void {
  const source = join(pluginRoot, 'i18n');
  if (!existsSync(source)) return;
  const jsonFiles = readdirSync(source)
    .filter((file) => file.endsWith('.json'))
    .filter((file) => statSync(join(source, file)).isFile());
  if (jsonFiles.length === 0) return;
  const target = join(config.build.outDir, 'i18n');
  mkdirSync(target, { recursive: true });
  for (const file of jsonFiles) {
    cpSync(join(source, file), join(target, file));
  }
}

/**
 * Vite plugin for Plexica plugin development.
 * Auto-configures Module Federation based on the plugin's manifest.json.
 *
 * @param options - Configuration options (optional manifest path override)
 * @returns Array of Vite plugins (includes Module Federation setup)
 * @throws {Error} if manifest.json is not found at the expected path
 */
export default function plexicaPluginVite(options: PlexicaPluginViteOptions = {}): Plugin[] {
  const manifestPath = resolve(options.manifestPath ?? './manifest.json');
  const pluginRoot = dirname(manifestPath);

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Plugin manifest not found at ${manifestPath}. ` +
        'Run create-plexica-plugin to scaffold a plugin project.'
    );
  }

  const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const mfConfig = generateMfConfig(manifest, SHARED_DEPS);

  let resolvedBuildConfig: ResolvedConfig | null = null;

  return [
    {
      name: 'plexica:i18n-assets',
      configResolved: (config) => {
        resolvedBuildConfig = config;
      },
      closeBundle: () => {
        if (resolvedBuildConfig !== null) {
          copyI18nBundles(pluginRoot, resolvedBuildConfig);
          resolvedBuildConfig = null;
        }
      },
    },
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