// __tests__/i18n-keys.test.ts
// Key-parity between the EN and IT catalogs (006-06) — a key missing from one
// catalog silently falls back to the EN default at runtime. Also covers the
// plugin i18n bundles (006-09): file keys ship UNPREFIXED, the schema accepts
// them, and registration namespaces them under `plugin.{slug}.` (D-8) with
// key-parity across locales.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parsePluginBundle } from '../plugin-bundle-schema.js';
import {
  clearPluginBundles,
  getPluginMessages,
  registerPluginBundle,
} from '../plugin-message-registry.js';
import { locales, SUPPORTED_LOCALES } from '../locales.js';

const enKeys = new Set<string>(Object.keys(locales.en));
const itKeys = new Set<string>(Object.keys(locales.it));

// The `plugin.` namespace is RESERVED for bundle keys (D-8): core catalogs must
// never define plugin-prefixed keys or a bundle could not override them.
const PLUGIN_NAMESPACE_PREFIX = 'plugin.';

function keySets(): { locale: string; extras: string[] }[] {
  return SUPPORTED_LOCALES.filter((locale) => locale !== 'en').map((locale) => ({
    locale,
    extras: Object.keys(locales[locale]).filter((key) => !enKeys.has(key)),
  }));
}

describe('i18n catalog key parity (006-06)', () => {
  it('EN and IT catalogs expose exactly the same key set', () => {
    expect(Array.from(enKeys).sort()).toEqual(Array.from(itKeys).sort());
    expect(itKeys.size).toBeGreaterThan(0);
  });

  it('no key is missing from the IT catalog', () => {
    for (const key of enKeys) {
      expect(itKeys.has(key), `key "${key}" is missing from the IT catalog`).toBe(true);
    }
  });

  it('no EN-default fallback key is silently absent in IT', () => {
    for (const { locale, extras } of keySets()) {
      expect(extras, `${locale} defines extra keys not present in EN`).toEqual([]);
    }
  });

  it('core catalogs never define plugin bundle-namespace keys (D-8)', () => {
    // Bundle keys are always `plugin.{slug}.{...}` — a slug segment (no dots)
    // plus at least one more segment. Single-segment core keys like
    // `plugin.unavailable` / `plugin.retry` describe the plugin system itself
    // and cannot collide with a bundle (a bundle key always carries ≥ 2 dots).
    const isBundleNamespaceKey = (key: string): boolean => {
      const rest = key.startsWith(PLUGIN_NAMESPACE_PREFIX)
        ? key.slice(PLUGIN_NAMESPACE_PREFIX.length)
        : '';
      return rest.includes('.');
    };
    const reserved = Array.from(enKeys).filter(isBundleNamespaceKey);
    expect(reserved).toEqual([]);
  });

  it('ICU placeholders match between locales for every key', () => {
    // Balanced-brace scanner: captures only TOP-LEVEL ICU arguments, so nested
    // plural/select syntax (e.g. {count, plural, one {# ...} other {# ...}})
    // contributes just the argument name (`count`), not its sub-values.
    const icuArguments = (value: string): string[] => {
      const args: string[] = [];
      let depth = 0;
      let start = -1;
      for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '{') {
          if (depth === 0) start = i + 1;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            const inner = value.slice(start, i);
            const name = inner.split(',')[0]?.trim() ?? '';
            if (name.length > 0 && name !== '#') args.push(name);
            start = -1;
          }
        }
      }
      return args.sort();
    };
    for (const key of enKeys) {
      const enPlaceholders = icuArguments(locales.en[key] ?? '');
      const itPlaceholders = icuArguments(locales.it[key] ?? '');
      expect(
        itPlaceholders,
        `placeholder mismatch on "${key}": EN ${JSON.stringify(enPlaceholders)} vs IT ${JSON.stringify(itPlaceholders)}`
      ).toEqual(enPlaceholders);
    }
  });
});

// ── Plugin i18n bundles (006-09) ──
// Same key parity enforced on the example CRM bundles + the D-8 prefix contract.

interface PluginBundleManifest {
  slug: string;
  i18n?: { bundles?: string[] };
}

// Resolve fixtures from the TEST FILE (apps/web/src/i18n/__tests__ is 5 levels
// below the repo root) — a process-CWD-relative path would escape the repo and
// silently skip every bundle assertion.
const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(TEST_DIR, '..', '..', '..', '..', '..');
const EXAMPLES_CRM_DIR = join(REPO_ROOT, 'examples', 'plugins', 'crm');

function pluginBundlePath(locale: string): string {
  return join(EXAMPLES_CRM_DIR, 'i18n', `${locale}.json`);
}

function bundleRaw(locale: string): string {
  return readFileSync(pluginBundlePath(locale), 'utf8');
}

describe('example CRM plugin i18n bundles (006-09)', () => {
  const manifestPath = join(EXAMPLES_CRM_DIR, 'manifest.json');
  const hasBundles = existsSync(manifestPath);

  const declaredBundles = (): string[] => {
    if (!hasBundles) return []; // repository layout without the example — skip
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginBundleManifest;
    return manifest.i18n?.bundles ?? [];
  };

  it('the CRM example declares i18n bundles and ships per-locale files', () => {
    const declared = declaredBundles();
    expect(declared.length).toBeGreaterThan(0);
    for (const locale of declared) {
      expect(existsSync(pluginBundlePath(locale)), `missing i18n/${locale}.json`).toBe(true);
    }
  });

  it('bundle file keys are UNPREFIXED and pass the runtime schema', () => {
    for (const locale of declaredBundles()) {
      const raw = bundleRaw(locale);
      // parsePluginBundle REJECTS `plugin.`-prefixed keys (double
      // namespacing) — a bundle with a prefixed key fails at load time.
      expect(() => parsePluginBundle(raw), `bundle ${locale}.json must parse`).not.toThrow();
      for (const key of Object.keys(parsePluginBundle(raw))) {
        expect(
          key.startsWith('plugin.'),
          `bundle key "${key}" must ship UNPREFIXED (the shell adds plugin.{slug}.)`
        ).toBe(false);
      }
    }
  });

  it('registered keys are plugin.{slug}.-namespaced with key-parity across locales', () => {
    const bundleLocales = declaredBundles();
    if (bundleLocales.length === 0) return;
    const slug = (JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginBundleManifest).slug;
    try {
      const merged = new Map<string, string[]>();
      for (const locale of bundleLocales) {
        const fileKeys = Object.keys(parsePluginBundle(bundleRaw(locale)));
        registerPluginBundle({
          slug,
          locale,
          // Every file key re-prefixed under plugin.{slug}. — the D-8 merge
          // contract the loader performs at registration time.
          messages: Object.fromEntries(fileKeys.map((key) => [`plugin.${slug}.${key}`, ''])),
          loadedAt: Date.now(),
        });
        merged.set(locale, Object.keys(getPluginMessages(locale)).sort());
      }
      const reference = bundleLocales[0] as string;
      for (const [locale, keys] of merged) {
        expect(keys, `${locale} merged key set must equal plugin.{slug}.{fileKey}`).toEqual(
          Object.keys(parsePluginBundle(bundleRaw(locale)))
            .map((key) => `plugin.${slug}.${key}`)
            .sort()
        );
        expect(keys, `${locale} lacks key-parity with ${reference}`).toEqual(merged.get(reference));
      }
    } finally {
      clearPluginBundles();
    }
  });
});
