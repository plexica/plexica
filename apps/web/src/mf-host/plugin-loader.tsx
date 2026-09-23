// plugin-loader.tsx
// Dynamic remote loader for Module Federation plugins.
// Fetches remoteEntry.js from the object-storage asset origin in production,
// or from dev server in dev.

import { createElement, lazy, Suspense } from 'react';
import * as ReactModule from 'react';
import * as ReactDomModule from 'react-dom';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactQueryModule from '@tanstack/react-query';
import * as ReactIntlModule from 'react-intl';
import {
  __federation_method_getRemote as getRemote,
  __federation_method_setRemote as setRemote,
  __federation_method_unwrapDefault as unwrapDefault,
} from 'virtual:__federation__';
import * as PlexicaUiModule from '@plexica/ui';

import { isOriginAllowed } from './remote-origin.js';
import { loadPluginI18n as loadPluginBundle } from './plugin-i18n-loader.js';

import type { ComponentType, LazyExoticComponent } from 'react';

const remoteCache = new Map<string, LazyExoticComponent<ComponentType<Record<string, unknown>>>>();

interface FederationShare {
  get: () => Promise<() => unknown>;
  from: string;
  scope: string;
}

type FederationScope = Record<string, Record<string, FederationShare>>;

function registerHostShareScope(): void {
  const root = globalThis as typeof globalThis & {
    __federation_shared__?: { default?: FederationScope };
  };
  root.__federation_shared__ ??= {};
  root.__federation_shared__.default ??= {};
  const scope = root.__federation_shared__.default;
  const shares: Array<[string, string, unknown]> = [
    ['react', '19.2.7', ReactModule],
    ['react/jsx-runtime', '19.2.7', ReactJsxRuntime],
    ['react-dom', '19.2.7', ReactDomModule],
    ['@tanstack/react-query', '5.0.0', ReactQueryModule],
    ['react-intl', '6.6.0', ReactIntlModule],
    ['@plexica/ui', '0.0.1', PlexicaUiModule],
  ];
  for (const [name, version, module] of shares) {
    scope[name] ??= {};
    scope[name][version] = {
      get: async () => () => module,
      from: 'plexica_shell',
      scope: 'default',
    };
  }
}

/**
 * Loads + registers a plugin's i18n bundle for the active locale (006-09, D-8).
 * Thin wrapper over the shared loader so plugin hosts import from one module.
 */
export function loadPluginMessages(
  input: Parameters<typeof loadPluginBundle>[0]
): Promise<void> {
  return loadPluginBundle(input);
}

/**
 * Loads a plugin remote component dynamically.
 */
export function loadPluginComponent(
  remoteEntryUrl: string,
  remoteName: string,
  extensionPoint: string,
): LazyExoticComponent<ComponentType<Record<string, unknown>>> {
  const cacheKey = `${remoteEntryUrl}#${remoteName}#${extensionPoint}`;

  const cached = remoteCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const LazyComponent = lazy<ComponentType<Record<string, unknown>>>(async () => {
    if (remoteEntryUrl.startsWith('http') && isOriginAllowed(remoteEntryUrl)) {
      const mod = await loadRemote(remoteEntryUrl, remoteName, extensionPoint);
      return { default: mod };
    }
    if (import.meta.env.DEV && remoteEntryUrl.startsWith('http')) {
      // eslint-disable-next-line no-console
      console.warn(
        `[PluginLoader] Remote entry origin rejected by storage origin allow-list: ${remoteEntryUrl}`
      );
    }
    // Fallback: placeholder for dev mode (real MF loading via dev-watcher)
    return {
      default: () =>
        createElement('div', { 'data-plugin-slot': remoteName, className: 'plugin-slot-placeholder' }),
    };
  });

  remoteCache.set(cacheKey, LazyComponent);
  return LazyComponent;
}

/**
 * Injects a remoteEntry.js script and resolves the exposed module.
 */
async function loadRemote(
  url: string,
  remoteName: string,
  extensionPoint: string,
): Promise<ComponentType<Record<string, unknown>>> {
  // Some federated CommonJS fallbacks retain this compile-time check. Vite
  // applications do not otherwise expose Node's process global.
  if (!('process' in globalThis)) {
    Object.defineProperty(globalThis, 'process', {
      value: { env: { NODE_ENV: 'production' } },
      configurable: true,
    });
  }
  // OriginJS leaves this host placeholder unresolved when all remotes are
  // registered at runtime. The runtime merges it with our real share scope.
  if (!('__rf_placeholder__shareScope' in globalThis)) {
    Object.defineProperty(globalThis, '__rf_placeholder__shareScope', {
      value: {},
      configurable: true,
    });
  }
  registerHostShareScope();
  setRemote(remoteName, { url, format: 'esm', from: 'vite' });
  const module = await getRemote(remoteName, `./${extensionPoint}`);
  const component = await unwrapDefault(module);
  if (typeof component !== 'function') {
    throw new Error(`Module "${extensionPoint}" not found in remote "${remoteName}"`);
  }
  return component as unknown as ComponentType<Record<string, unknown>>;
}

export function clearRemoteCache(): void {
  remoteCache.clear();
}

export { Suspense };
