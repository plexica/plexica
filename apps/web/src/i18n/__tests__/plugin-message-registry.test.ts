// i18n/__tests__/plugin-message-registry.test.ts
// Registry behaviors behind the 006-09 loop fix: idempotent registration
// (an identical merged message map must NOT bump the version), monotonic
// per-locale versioning, and the `hasPluginBundle` loaded-signal the loader
// uses to short-circuit re-fetches.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearPluginBundles,
  getPluginMessages,
  getPluginMessagesVersion,
  hasPluginBundle,
  pluginBundleCount,
  registerPluginBundle,
  subscribePluginMessages,
} from '../plugin-message-registry.js';

function bundle(slug: string, locale: string, messages: Record<string, string>) {
  return { slug, locale, messages, loadedAt: Date.now() };
}

describe('plugin-message-registry (006-09 loop fix)', () => {
  beforeEach(() => clearPluginBundles());
  afterEach(() => clearPluginBundles());

  it('notifies once and bumps the version for a NEW bundle', () => {
    let notified = 0;
    const unsubscribe = subscribePluginMessages(() => {
      notified += 1;
    });
    try {
      const versionBefore = getPluginMessagesVersion('en');
      registerPluginBundle(bundle('crm', 'en', { 'plugin.crm.list.title': 'Contacts' }));
      expect(getPluginMessagesVersion('en')).toBe(versionBefore + 1);
      expect(notified).toBe(1);
      expect(hasPluginBundle('crm', 'en')).toBe(true);
    } finally {
      unsubscribe();
    }
  });

  it('an IDENTICAL re-registration is a no-op: no notify, no version bump', () => {
    registerPluginBundle(bundle('crm', 'en', { 'plugin.crm.list.title': 'Contacts' }));
    const version = getPluginMessagesVersion('en');
    const count = pluginBundleCount();
    let notified = 0;
    const unsubscribe = subscribePluginMessages(() => {
      notified += 1;
    });
    try {
      // New object, equal merged map (same keys + values, different ordering
      // of construction) — the loader path that previously re-fetched and
      // re-registered in a loop.
      registerPluginBundle(bundle('crm', 'en', { 'plugin.crm.list.title': 'Contacts' }));
      expect(notified).toBe(0);
      expect(getPluginMessagesVersion('en')).toBe(version);
      expect(pluginBundleCount()).toBe(count);
    } finally {
      unsubscribe();
    }
  });

  it('a CHANGED re-registration notifies and bumps the version (monotonic)', () => {
    registerPluginBundle(bundle('crm', 'en', { 'plugin.crm.list.title': 'Contacts' }));
    const versionOne = getPluginMessagesVersion('en');
    registerPluginBundle(bundle('crm', 'en', { 'plugin.crm.list.title': 'Contatti' }));
    expect(getPluginMessagesVersion('en')).toBe(versionOne + 1);
  });

  it('versions are per-locale and strictly monotonic even within one millisecond', () => {
    registerPluginBundle(bundle('a', 'en', { x: '1' }));
    registerPluginBundle(bundle('b', 'en', { y: '2' }));
    registerPluginBundle(bundle('c', 'it', { x: 'uno' }));

    expect(getPluginMessagesVersion('en')).toBe(2);
    expect(getPluginMessagesVersion('it')).toBe(1);

    // The old `loadedAt`-sum approach collapsed two bundles loaded in the same
    // millisecond to the SAME version sum. A counter must never do that.
    const enVersion = getPluginMessagesVersion('en');
    registerPluginBundle(bundle('c', 'en', { z: '3' }));
    expect(getPluginMessagesVersion('en')).toBe(enVersion + 1);
  });

  it('hasPluginBundle reflects registration and clear', () => {
    registerPluginBundle(bundle('crm', 'en', { a: '1' }));
    expect(hasPluginBundle('crm', 'en')).toBe(true);
    expect(hasPluginBundle('crm', 'it')).toBe(false);
    expect(hasPluginBundle('other', 'en')).toBe(false);

    clearPluginBundles();
    expect(hasPluginBundle('crm', 'en')).toBe(false);
    expect(getPluginMessagesVersion('en')).toBe(0);
  });

  it('getPluginMessages merges replaced content per locale', () => {
    registerPluginBundle(bundle('crm', 'en', { 'plugin.crm.list.title': 'Contacts' }));
    registerPluginBundle(bundle('crm', 'en', { 'plugin.crm.list.title': 'Contatti', extra: 'x' }));
    registerPluginBundle(bundle('crm', 'it', { 'plugin.crm.list.title': 'Contatti' }));
    expect(getPluginMessages('en')).toEqual({ 'plugin.crm.list.title': 'Contatti', extra: 'x' });
    expect(getPluginMessages('it')).toEqual({ 'plugin.crm.list.title': 'Contatti' });
  });
});
