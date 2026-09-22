// i18n/__tests__/plugin-i18n-loader.test.ts
// Loader no-op contract (006-09 loop fix): a bundle that is ALREADY registered
// must never be re-fetched (the primary guard against the fetch/re-render
// loop), concurrent callers share ONE in-flight fetch, locales the plugin does
// not ship are never fetched, and failed loads stay retryable.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadPluginI18n } from '../../mf-host/plugin-i18n-loader.js';
import {
  clearPluginBundles,
  hasPluginBundle,
  pluginBundleCount,
} from '../plugin-message-registry.js';

const VALID_BUNDLE = JSON.stringify({ 'list.title': 'Contacts' });

// Dev allow-listed origin (4001) — the sibling `i18n/{locale}.json` derivation
// keeps the full URL on the allow-list so the origin guard does not skip work.
const INPUT = {
  slug: 'crm',
  remoteEntryUrl: 'http://localhost:4001/remoteEntry.js',
  bundles: ['en'],
  locale: 'en',
} as const;

function stubFetchOk(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => VALID_BUNDLE });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('loadPluginI18n (006-09 loop fix)', () => {
  beforeEach(() => {
    clearPluginBundles();
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    clearPluginBundles();
    vi.unstubAllGlobals();
  });

  it('fetches a bundle once and registers it', async () => {
    const fetchMock = stubFetchOk();
    await loadPluginI18n(INPUT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hasPluginBundle('crm', 'en')).toBe(true);
  });

  it('is a TRUE no-op for an already-loaded bundle: no re-fetch, no registry write', async () => {
    const fetchMock = stubFetchOk();
    await loadPluginI18n(INPUT); // fetch → registers
    const registered = pluginBundleCount();

    await loadPluginI18n(INPUT);
    await loadPluginI18n(INPUT);
    expect(fetchMock).toHaveBeenCalledTimes(1); // never hits the network again
    expect(pluginBundleCount()).toBe(registered); // no duplicate registration
  });

  it('shares ONE in-flight fetch across concurrent callers', async () => {
    const fetchMock = stubFetchOk();
    await Promise.all([loadPluginI18n(INPUT), loadPluginI18n(INPUT), loadPluginI18n(INPUT)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hasPluginBundle('crm', 'en')).toBe(true);
  });

  it('never fetches a locale the plugin does not ship', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await loadPluginI18n({ ...INPUT, locale: 'de' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hasPluginBundle('crm', 'de')).toBe(false);
  });

  it('failed loads stay retryable — a 404 does not poison later attempts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, text: async () => '' })
      .mockResolvedValue({ ok: true, text: async () => VALID_BUNDLE });
    vi.stubGlobal('fetch', fetchMock);

    await loadPluginI18n(INPUT); // 404 → dropped, NOT registered
    expect(hasPluginBundle('crm', 'en')).toBe(false);

    await loadPluginI18n(INPUT); // retry succeeds
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hasPluginBundle('crm', 'en')).toBe(true);
  });

  it('an invalid bundle body is surface-contained and retryable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => 'not json' })
      .mockResolvedValue({ ok: true, text: async () => VALID_BUNDLE });
    vi.stubGlobal('fetch', fetchMock);

    await loadPluginI18n(INPUT);
    expect(hasPluginBundle('crm', 'en')).toBe(false);

    await loadPluginI18n(INPUT);
    expect(hasPluginBundle('crm', 'en')).toBe(true);
  });
});
