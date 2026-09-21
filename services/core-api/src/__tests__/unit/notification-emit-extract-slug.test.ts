// notification-emit-extract-slug.test.ts
// UNIT: the notification emit route's slug extractor (review M4 — the export
// had no importer). Mirrors plugin-install-logic.test.ts for events.routes.ts.
// The slug segment drives the impersonation guard (verifyPluginInstalled) and
// the rate-limit key, so a wrong parse would mis-scope a plugin's emissions.

import { describe, expect, it } from 'vitest';

import { _testExtractSlug } from '../../modules/notification/emit.routes.js';

describe('notification emit extractSlug', () => {
  it('extracts the plugin slug from a pre-prefixed notification type', () => {
    expect(_testExtractSlug('plugin.crm.contact_created')).toBe('crm');
    expect(_testExtractSlug('plugin.sales.pipeline.updated')).toBe('sales');
  });

  it('returns an empty slug for a type without a plugin segment', () => {
    expect(_testExtractSlug('plugin')).toBe('');
    expect(_testExtractSlug('plugin.')).toBe('');
  });

  it('still returns the second segment for non-plugin types (caller guards reject them)', () => {
    expect(_testExtractSlug('workspace.invite')).toBe('invite');
  });
});
