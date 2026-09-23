// lib/__tests__/translation-overrides.test.ts
// Override flattening helpers (006-10) — the shell merge lives on top of these.

import { describe, expect, it } from 'vitest';

import {
  overrideKeys,
  overrideValue,
  overridesForLocale,
} from '../translation-overrides.js';

import type { TranslationOverrideList } from '../../services/translations-api.js';

const LIST: TranslationOverrideList = {
  overrides: {
    'common.save': { en: 'Save', it: 'Salva' },
    'crm.list.title': { it: 'Contatti personalizzati' },
    'plugin.crm.deals': { en: 'Deals'},
  },
};

describe('overridesForLocale', () => {
  it('flattens only the active locale', () => {
    expect(overridesForLocale(LIST, 'it')).toEqual({
      'common.save': 'Salva',
      'crm.list.title': 'Contatti personalizzati',
    });
    expect(overridesForLocale(LIST, 'en')).toEqual({
      'common.save': 'Save',
      'plugin.crm.deals': 'Deals',
    });
  });

  it('returns an empty map for undefined data', () => {
    expect(overridesForLocale(undefined, 'en')).toEqual({});
  });
});

describe('overrideKeys / overrideValue', () => {
  it('lists distinct keys sorted', () => {
    expect(overrideKeys(LIST)).toEqual(['common.save', 'crm.list.title', 'plugin.crm.deals']);
  });

  it('reads a single locale value', () => {
    expect(overrideValue(LIST, 'crm.list.title', 'it')).toBe('Contatti personalizzati');
    expect(overrideValue(LIST, 'crm.list.title', 'en')).toBeUndefined();
  });
});