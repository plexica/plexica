// i18n/__tests__/plugin-bundle-schema.test.ts
// Plugin bundle validation (006-09 — poisoning risk, plan §14): structural
// schema + 100 KB size cap + namespace-prefix rejection.

import { describe, expect, it } from 'vitest';

import { PLUGIN_BUNDLE_MAX_BYTES, parsePluginBundle } from '../plugin-bundle-schema.js';

describe('parsePluginBundle', () => {
  it('accepts a valid flat bundle', () => {
    const result = parsePluginBundle(
      JSON.stringify({ 'list.title': 'Contacts', 'save.cta': 'Save' })
    );
    expect(result).toEqual({ 'list.title': 'Contacts', 'save.cta': 'Save' });
  });

  it('rejects non-object payloads', () => {
    expect(() => parsePluginBundle('[]')).toThrow(/validation/i);
    expect(() => parsePluginBundle('"hi"')).toThrow(/validation/i);
    expect(() => parsePluginBundle('not json')).toThrow(/JSON/i);
  });

  it('rejects plugin.-prefixed keys (double-namespacing)', () => {
    expect(() => parsePluginBundle(JSON.stringify({ 'plugin.crm.title': 'X' }))).toThrow(
      /must NOT be prefix-namespaced/i
    );
  });

  it('rejects non-string values / empty values', () => {
    expect(() => parsePluginBundle(JSON.stringify({ title: 42 }))).toThrow(/validation/i);
    expect(() => parsePluginBundle(JSON.stringify({ title: '' }))).toThrow(/validation/i);
  });

  it('rejects empty bundles', () => {
    expect(() => parsePluginBundle('{}')).toThrow(/empty/i);
  });

  it('enforces the 100 KB size cap', () => {
    const big = JSON.stringify({ key: 'x'.repeat(PLUGIN_BUNDLE_MAX_BYTES) });
    expect(() => parsePluginBundle(big)).toThrow(/size cap/);
  });

  it('caps byte length, not UTF-16 length (multi-byte payload)', () => {
    // Each '€' is 3 UTF-8 bytes but 1 UTF-16 unit: 35 000 units stay below the
    // old unit-count gate while 105 000 bytes exceed the real 100 KB cap.
    const multiByte = JSON.stringify({ key: '€'.repeat(Math.ceil(PLUGIN_BUNDLE_MAX_BYTES / 3)) });
    expect(multiByte.length).toBeLessThan(PLUGIN_BUNDLE_MAX_BYTES);
    expect(() => parsePluginBundle(multiByte)).toThrow(/size cap/);
  });
});
