// notification-prefs.test.ts
// Unit tests for the prefs dirty check (review B2): the save button must be
// disabled when the draft equals the persisted prefs (first render AND after a
// save that rebuilds the draft from the fresh server state) and enabled only
// while the user has actually changed something. Key-order independence is
// asserted because the draft and the loaded prefs are assembled independently.

import { describe, expect, it } from 'vitest';

import { prefsHaveChanges } from './notification-prefs.js';

import type { PrefsDraft } from './notification-prefs.js';
import type { NotificationPreferences } from '../types/notification.js';

const loaded: NotificationPreferences = {
  defaults: { inApp: true, email: false },
  types: { 'workspace.invite': { inApp: true, email: false } },
};

describe('prefsHaveChanges', () => {
  it('returns false when the draft equals the loaded prefs (first render)', () => {
    const draft: PrefsDraft = {
      defaults: { inApp: true, email: false },
      types: { 'workspace.invite': { inApp: true, email: false } },
    };
    expect(prefsHaveChanges(draft, loaded)).toBe(false);
  });

  it('is insensitive to object key order (independent assembly)', () => {
    const draft: PrefsDraft = {
      types: { 'workspace.invite': { email: false, inApp: true } },
      defaults: { email: false, inApp: true },
    };
    expect(prefsHaveChanges(draft, loaded)).toBe(false);
  });

  it('returns true when any channel differs', () => {
    const draft: PrefsDraft = {
      defaults: { inApp: true, email: false },
      types: { 'workspace.invite': { inApp: true, email: true } },
    };
    expect(prefsHaveChanges(draft, loaded)).toBe(true);
  });

  it('returns true when a new type override is added', () => {
    const draft: PrefsDraft = {
      defaults: { inApp: true, email: false },
      types: {
        'workspace.invite': { inApp: true, email: false },
        'plugin.crm.contact_created': { inApp: true, email: true },
      },
    };
    expect(prefsHaveChanges(draft, loaded)).toBe(true);
  });

  it('returns false again after a save rebuilds the draft from the server state', () => {
    const saved: NotificationPreferences = {
      defaults: { inApp: true, email: true },
      types: { 'workspace.invite': { inApp: true, email: true } },
    };
    const draftAfterSave: PrefsDraft = {
      defaults: { inApp: true, email: true },
      types: { 'workspace.invite': { inApp: true, email: true } },
    };
    expect(prefsHaveChanges(draftAfterSave, saved)).toBe(false);
  });
});
