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

/**
 * Monotonic per-locale snapshot version. A flat counter instead of summing
 * `loadedAt` — two failure modes:
 *  1. N bundles for the same locale loaded within the same millisecond summed
 *     to the same value, so a LATER load did not bump the version (stale UI);
 *  2. ANY re-registration bumped the version even when the merged message set
 *     was byte-identical, re-rendering the whole IntlProvider subtree in a
 *     loop (006-09 follow-up HIGH: slot effects re-fire on render).
 */
const versions = new Map<string, number>();

function messagesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false; // b lacking the key → undefined ≠ value
  }
  return true;
}

/** Registers (or replaces) one plugin locale bundle. */
export function registerPluginBundle(bundle: PluginBundle): void {
  const key = `${bundle.slug}:${bundle.locale}`;
  const existing = bundles.get(key);
  // Idempotent registration: a re-fetched bundle whose merged messages did not
  // change must NOT bump the version and re-render every consumer. Together
  // with `hasPluginBundle` in the loader this breaks the fetch/re-render loop.
  if (existing !== undefined && messagesEqual(existing.messages, bundle.messages)) {
    return;
  }
  bundles.set(key, bundle);
  versions.set(bundle.locale, (versions.get(bundle.locale) ?? 0) + 1);
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
 * Snapshot version for `useSyncExternalStore`: monotonic counter per locale,
 * incremented only when a bundle for that locale is inserted or replaced with
 * DIFFERENT content. Consumers re-render on bundle load without re-rendering
 * on unrelated locales or on identical re-registrations.
 */
export function getPluginMessagesVersion(locale: string): number {
  return versions.get(locale) ?? 0;
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
  versions.clear();
  for (const listener of listeners) listener();
}
