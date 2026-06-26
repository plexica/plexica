// plugin-loader.tsx
// Dynamic remote loader for Module Federation plugins.
// Fetches remoteEntry.js from MinIO in production, or from dev server in dev.

import { createElement, lazy, Suspense } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

const remoteCache = new Map<string, LazyExoticComponent<ComponentType<Record<string, unknown>>>>();

interface RemoteModule {
  [key: string]: ComponentType<Record<string, unknown>>;
}

// Allow-list of origins for remote script injection
const ALLOWED_ORIGINS = [
  'http://localhost:4001',
  'http://localhost:4002',
  'http://localhost:4003',
  'http://localhost:4004',
  'http://localhost:4005',
  'http://127.0.0.1:4001',
];

const MINIO_ORIGIN_PATTERN = /^https:\/\/minio\./;

function isOriginAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_ORIGINS.includes(parsed.origin) || MINIO_ORIGIN_PATTERN.test(parsed.origin);
  } catch {
    return false;
  }
}

/**
 * Loads a plugin remote component dynamically.
 */
export function loadPluginComponent(
  remoteEntryUrl: string,
  remoteName: string
): LazyExoticComponent<ComponentType<Record<string, unknown>>> {
  const cacheKey = `${remoteEntryUrl}#${remoteName}`;

  if (remoteCache.has(cacheKey)) {
    return remoteCache.get(cacheKey)!;
  }

  const LazyComponent = lazy<ComponentType<Record<string, unknown>>>(async () => {
    if (remoteEntryUrl.startsWith('http') && isOriginAllowed(remoteEntryUrl)) {
      const mod = await loadRemoteScript(remoteEntryUrl, remoteName);
      return { default: mod };
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
async function loadRemoteScript(url: string, remoteName: string): Promise<ComponentType<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.type = 'text/javascript';
    script.async = true;
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      // MF exposes modules under the remote name (plugin slug), not the extension point path
      const remote = (window as unknown as Record<string, unknown>)[remoteName] as RemoteModule | undefined;
      if (remote?.default) {
        resolve(remote.default);
      } else {
        reject(new Error(`Module default export not found in remote "${remoteName}" at "${url}"`));
      }
      // Clean up script element after load
      document.head.removeChild(script);
    };

    script.onerror = () => {
      document.head.removeChild(script);
      reject(new Error(`Failed to load remote entry: ${url}`));
    };

    document.head.appendChild(script);
  });
}

export function clearRemoteCache(): void {
  remoteCache.clear();
}

export { Suspense };
