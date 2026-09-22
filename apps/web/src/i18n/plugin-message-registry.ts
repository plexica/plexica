// i18n/plugin-message-registry.ts
// In-memory store for plugin i18n bundles (006-09).
//
// The shell fetches `i18n/{locale}.json` assets declared in a plugin manifest
// and merges them into the ACTIVE message set under the `plugin.{slug}.`
// namespace prefix (D-8 — no key collisions with the core catalog). Because
// plugins load asynchronously and the locale can change at any time, the
// registry is a tiny external store (no Zustand — the auth store is the ONLY
// Zustand store, Rule 3) that React consumes via useSyncExternalStore.

export interface PluginBundle {
  slug: string;
  locale: string;
  messages: Record<string, string>;
  loadedAt: number;
}

type Listener = () => void;

// keyed by `${slug}:${locale}`
const bundles = new Map<string, PluginBundle>();
const listeners = new Set<Listener>();

/** Registers (or replaces) one plugin locale bundle. */
export function registerPluginBundle(bundle: PluginBundle): void {
  bundles.set(`${bundle.slug}:${bundle.locale}`, bundle);
  for (const listener of listeners) listener();
}

/** True when a bundle is loaded for the given slug+locale. */
export function hasPluginBundle(slug: string, locale: string): boolean {
  return bundles.has(`${slug}:${locale}`);
}

/** Flattens every loaded bundle for `locale` into one message map. */
export function getPluginMessages(locale: string): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const bundle of bundles.values()) {
    if (bundle.locale !== locale) continue;
    for (const [key, value] of Object.entries(bundle.messages)) {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Snapshot version for `useSyncExternalStore`: increments only when the set of
 * messages for `locale` actually changes, so consumers re-render on bundle
 * load without re-rendering on unrelated locales.
 */
export function getPluginMessagesVersion(locale: string): number {
  let version = 0;
  let seen = false;
  for (const bundle of bundles.values()) {
    if (bundle.locale !== locale) continue;
    seen = true;
    version += bundle.loadedAt;
  }
  return seen ? version : 0;
}

/** Total bundles held (diagnostics/tests). */
export function pluginBundleCount(): number {
  return bundles.size;
}

/** Subscribes to registry changes. Returns an unsubscribe function. */
export function subscribePluginMessages(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test/diagnostic helper: clears every bundle (memory owned by the shell). */
export function clearPluginBundles(): void {
  bundles.clear();
  for (const listener of listeners) listener();
}