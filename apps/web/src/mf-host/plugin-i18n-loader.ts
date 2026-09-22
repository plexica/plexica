// mf-host/plugin-i18n-loader.ts
// Fetches + validates + registers plugin i18n bundles (006-09, D-8).
//
// A plugin manifest declares `i18n.bundles` (the locales it ships). The shell
// fetches each locale's bundle — either the EXPLICIT per-locale presigned URL
// the marketplace returns (production; each object signed for itself) or the
// sibling `i18n/{locale}.json` of the MF remote asset base (dev backends) —
// validates it (Zod schema + 100 KB size cap — plugin poisoning risk, plan
// §14), and merges it under `plugin.{slug}.` keys into the plugin-message
// registry, which the IntlMessageProvider consumes.
//
// Failures are SURFACE-CONTAINED: a bad bundle logs and is dropped — the UI
// keeps rendering with `defaultMessage` EN fallbacks (spec risk mitigation).

import { hasPluginBundle, registerPluginBundle } from '../i18n/plugin-message-registry.js';
import { parsePluginBundle } from '../i18n/plugin-bundle-schema.js';

import { isOriginAllowed } from './remote-origin.js';

const inFlight = new Map<string, Promise<void>>();

export interface PluginI18nLoadInput {
  slug: string;
  remoteEntryUrl: string;
  bundles: readonly string[];
  locale: string;
  /**
   * Explicit per-locale bundle URLs from the marketplace (006-09). In
   * production every locale is PRESIGNED for its own object — the old
   * sibling-derivation from the presigned `remoteEntryUrl` leaked the wrong
   * SigV4 signature into `i18n/{locale}.json` (SignatureDoesNotMatch). Dev
   * backends omit this and fall back to the un-signed relative path.
   */
  bundleUrls?: Record<string, string> | undefined;
}

/** Explicit presigned bundle URL when provided, else the sibling asset path. */
function bundleUrl(
  remoteEntryUrl: string,
  locale: string,
  bundleUrls: Record<string, string> | undefined
): string {
  const explicit = bundleUrls?.[locale];
  if (explicit !== undefined) return explicit;
  return new URL(`i18n/${locale}.json`, remoteEntryUrl).href;
}

function prefixUnderSlug(slug: string, record: Record<string, string>): Record<string, string> {
  const prefix = `plugin.${slug}.`;
  const prefixed: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    prefixed[`${prefix}${key}`] = value;
  }
  return prefixed;
}

/**
 * Ensures the bundle for (`slug`, `locale`) is loaded. Concurrent callers of
 * the same URL share one in-flight promise. Once the bundle is registered the
 * call is a true no-op — no re-fetch AND no registry write (006-09 loop fix:
 * slot effects re-fire whenever the entries-array identity changes; without
 * this guard every re-fire would re-fetch and bump the registry version,
 * re-rendering the whole IntlProvider subtree in a loop).
 */
export function loadPluginI18n(input: PluginI18nLoadInput): Promise<void> {
  const { slug, remoteEntryUrl, bundles, locale, bundleUrls } = input;
  if (!bundles.includes(locale)) return Promise.resolve();
  if (hasPluginBundle(slug, locale)) return Promise.resolve();

  const url = bundleUrl(remoteEntryUrl, locale, bundleUrls);
  const cacheKey = `${url}#${locale}`;
  const existing = inFlight.get(cacheKey);
  if (existing !== undefined) return existing;

  const promise = fetchAndRegister(slug, url, locale).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, promise);
  return promise;
}

async function fetchAndRegister(slug: string, url: string, locale: string): Promise<void> {
  if (!isOriginAllowed(url)) {
    // Same boundary as remoteEntry injection: a bundle from an unknown origin
    // is never fetched (it could carry arbitrary message content).
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[PluginI18n] Bundle origin rejected by allow-list: ${url}`);
    }
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) return; // e.g. 404 — plugin ships no bundle for this locale path
    const raw = await response.text();
    const record = parsePluginBundle(raw);
    registerPluginBundle({
      slug,
      locale,
      messages: prefixUnderSlug(slug, record),
      loadedAt: Date.now(),
    });
  } catch (err) {
    // Surface-contained: a poisoned/invalid bundle must not break the shell.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[PluginI18n] Failed to load bundle ${url}: ${String(err)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
