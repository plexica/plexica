// unit/notification/preferences.test.ts
// Unit tests for notification_prefs normalization (fix 6d, feature 006-04).
// Covers the three accepted shapes: flat-boolean legacy, legacy category shape
// (user-profile module) and the nested D-6 shape.

import { describe, expect, it } from 'vitest';

import { normalizePreferences } from '../../../modules/notification/types.js';

describe('normalizePreferences', () => {
  it('returns defaults for null / missing / empty', () => {
    expect(normalizePreferences(null)).toEqual({
      defaults: { inApp: true, email: false },
      types: {},
    });
    expect(normalizePreferences({})).toEqual({
      defaults: { inApp: true, email: false },
      types: {},
    });
  });

  it('normalizes the legacy flat-boolean shape (true → in-app only)', () => {
    const result = normalizePreferences({
      'workspace.invite': true,
      'plugin.crm.contact_created': false,
    });
    expect(result.types['workspace.invite']).toEqual({ inApp: true, email: false });
    expect(result.types['plugin.crm.contact_created']).toEqual({ inApp: false, email: false });
    expect(result.defaults).toEqual({ inApp: true, email: false });
  });

  it('normalizes the legacy category shape (user-profile module)', () => {
    const result = normalizePreferences({
      invite_received: { email: true },
      workspace_changes: { email: false },
      role_changes: { email: true },
    });
    expect(result.types['workspace.invite']).toEqual({ inApp: true, email: true });
    expect(result.types['workspace.created']).toEqual({ inApp: true, email: false });
    expect(result.types['workspace.role_changed']).toEqual({ inApp: true, email: true });
    expect(result.defaults).toEqual({ inApp: true, email: false });
  });

  it('passes through the nested D-6 shape unchanged', () => {
    const raw = {
      defaults: { inApp: false, email: true },
      types: { 'workspace.invite': { inApp: true, email: false } },
    };
    expect(normalizePreferences(raw)).toEqual(raw);
  });

  it('falls back to defaults for malformed nested channel values', () => {
    const result = normalizePreferences({
      defaults: { inApp: 'yes' as unknown as boolean, email: true },
      types: { 'plugin.a.b': { inApp: false, email: null as unknown as boolean } },
    });
    expect(result.defaults).toEqual({ inApp: true, email: true });
    expect(result.types['plugin.a.b']).toEqual({ inApp: false, email: true });
  });
});
