/**
 * Translation Schemas Unit Tests
 *
 * Comprehensive tests for Zod validation schemas used in the i18n module.
 * Security-critical validation (Constitution Art. 4.1 requires 100% coverage).
 *
 * Tests cover FR-011 (key validation), API payload validation, and edge cases.
 *
 * @module __tests__/i18n/unit/translation.schemas
 */

import { describe, it, expect } from 'vitest';
import {
  TranslationKeySchema,
  LocaleCodeSchema,
  NamespaceSchema,
  TenantOverrideSchema,
  TranslationOverridePayloadSchema,
  GetTranslationsQuerySchema,
  GetTranslationsParamsSchema,
  TranslationBundleResponseSchema,
  AvailableLocalesResponseSchema,
  TenantOverridesResponseSchema,
} from '../../../modules/i18n/i18n.schemas.js';

describe('TranslationKeySchema (FR-011)', () => {
  describe('Valid keys', () => {
    it('should accept simple key', () => {
      const result = TranslationKeySchema.safeParse('contacts');
      expect(result.success).toBe(true);
    });

    it('should accept dotted key path (2 levels)', () => {
      const result = TranslationKeySchema.safeParse('contacts.title');
      expect(result.success).toBe(true);
    });

    it('should accept dotted key path (5 levels - max allowed)', () => {
      const result = TranslationKeySchema.safeParse('a.b.c.d.e');
      expect(result.success).toBe(true);
    });

    it('should accept keys with underscores', () => {
      const result = TranslationKeySchema.safeParse('contacts.fields.first_name');
      expect(result.success).toBe(true);
    });

    it('should accept keys with numbers', () => {
      const result = TranslationKeySchema.safeParse('error.code_404');
      expect(result.success).toBe(true);
    });

    it('should accept mixed case', () => {
      const result = TranslationKeySchema.safeParse('MyKey.SubKey');
      expect(result.success).toBe(true);
    });

    it('should accept key at exactly 128 characters', () => {
      const key = 'a'.repeat(128);
      const result = TranslationKeySchema.safeParse(key);
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid keys - max length', () => {
    it('should reject key > 128 characters', () => {
      const key = 'a'.repeat(129);
      const result = TranslationKeySchema.safeParse(key);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('128 characters or less');
      }
    });
  });

  describe('Invalid keys - forbidden characters', () => {
    it('should reject key with spaces', () => {
      const result = TranslationKeySchema.safeParse('contacts with spaces');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'alphanumeric characters, dots, and underscores'
        );
      }
    });

    it('should reject key with hyphens', () => {
      const result = TranslationKeySchema.safeParse('contacts-title');
      expect(result.success).toBe(false);
    });

    it('should reject key with special characters', () => {
      const result = TranslationKeySchema.safeParse('contacts@title');
      expect(result.success).toBe(false);
    });

    it('should reject key with slashes', () => {
      const result = TranslationKeySchema.safeParse('contacts/title');
      expect(result.success).toBe(false);
    });
  });

  describe('Invalid keys - reserved prefix', () => {
    it('should reject key starting with "_system."', () => {
      const result = TranslationKeySchema.safeParse('_system.internal_key');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('reserved prefix "_system."');
      }
    });

    it('should allow "_system" without dot separator', () => {
      const result = TranslationKeySchema.safeParse('_system');
      expect(result.success).toBe(true);
    });

    it('should allow "_system_" prefix (no dot)', () => {
      const result = TranslationKeySchema.safeParse('_system_key');
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid keys - nesting depth', () => {
    it('should reject key with 6 nesting levels', () => {
      const result = TranslationKeySchema.safeParse('a.b.c.d.e.f');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('5 nesting levels');
      }
    });

    it('should reject key with 7 nesting levels', () => {
      const result = TranslationKeySchema.safeParse('a.b.c.d.e.f.g');
      expect(result.success).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should reject empty string', () => {
      const result = TranslationKeySchema.safeParse('');
      expect(result.success).toBe(false);
    });

    // Note: The regex ^[a-zA-Z0-9._]+$ allows dots at start/end and consecutive dots
    // This is acceptable for our use case - plugin developers are responsible for
    // providing valid key paths. The nesting level check provides the main constraint.
    it('should accept key starting with dot (though unconventional)', () => {
      const result = TranslationKeySchema.safeParse('.contacts');
      expect(result.success).toBe(true); // Regex allows this
    });

    it('should accept key ending with dot (though unconventional)', () => {
      const result = TranslationKeySchema.safeParse('contacts.');
      expect(result.success).toBe(true); // Regex allows this
    });

    it('should accept key with consecutive dots (though unconventional)', () => {
      const result = TranslationKeySchema.safeParse('contacts..title');
      expect(result.success).toBe(true); // Regex allows this
    });
  });
});

describe('LocaleCodeSchema', () => {
  describe('Valid locale codes', () => {
    it('should accept 2-letter language code', () => {
      expect(LocaleCodeSchema.safeParse('en').success).toBe(true);
    });

    it('should accept language-REGION format', () => {
      expect(LocaleCodeSchema.safeParse('en-US').success).toBe(true);
      expect(LocaleCodeSchema.safeParse('it-IT').success).toBe(true);
      expect(LocaleCodeSchema.safeParse('pt-BR').success).toBe(true);
    });
  });

  describe('Invalid locale codes', () => {
    it('should reject single letter code', () => {
      const result = LocaleCodeSchema.safeParse('e');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('BCP 47 format');
      }
    });

    it('should reject 3-letter code', () => {
      expect(LocaleCodeSchema.safeParse('eng').success).toBe(false);
    });

    it('should reject uppercase language code', () => {
      expect(LocaleCodeSchema.safeParse('EN').success).toBe(false);
    });

    it('should reject lowercase region code', () => {
      expect(LocaleCodeSchema.safeParse('en-us').success).toBe(false);
    });

    it('should reject missing region after hyphen', () => {
      expect(LocaleCodeSchema.safeParse('en-').success).toBe(false);
    });

    it('should reject invalid separator (underscore)', () => {
      expect(LocaleCodeSchema.safeParse('en_US').success).toBe(false);
    });
  });
});

describe('NamespaceSchema', () => {
  describe('Valid namespaces', () => {
    it('should accept simple namespace', () => {
      expect(NamespaceSchema.safeParse('core').success).toBe(true);
    });

    it('should accept namespace with hyphens', () => {
      expect(NamespaceSchema.safeParse('advanced-analytics').success).toBe(true);
    });

    it('should accept namespace with numbers', () => {
      expect(NamespaceSchema.safeParse('crm2024').success).toBe(true);
    });

    it('should accept 50-character namespace (max)', () => {
      const ns = 'a'.repeat(50);
      expect(NamespaceSchema.safeParse(ns).success).toBe(true);
    });
  });

  describe('Invalid namespaces', () => {
    it('should reject empty namespace', () => {
      const result = NamespaceSchema.safeParse('');
      expect(result.success).toBe(false);
      // Regex fails first, so error message is about format, not length
      if (!result.success) {
        expect(result.error.issues[0].message).toBeDefined();
      }
    });

    it('should reject namespace > 50 characters', () => {
      const ns = 'a'.repeat(51);
      const result = NamespaceSchema.safeParse(ns);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('50 characters or less');
      }
    });

    it('should reject uppercase letters', () => {
      expect(NamespaceSchema.safeParse('Core').success).toBe(false);
    });

    it('should reject underscores', () => {
      expect(NamespaceSchema.safeParse('advanced_analytics').success).toBe(false);
    });

    it('should reject special characters', () => {
      expect(NamespaceSchema.safeParse('core@analytics').success).toBe(false);
    });

    it('should reject spaces', () => {
      expect(NamespaceSchema.safeParse('core analytics').success).toBe(false);
    });
  });
});

describe('TenantOverrideSchema (FR-006, FR-007)', () => {
  describe('Valid override structures', () => {
    it('should accept valid nested structure', () => {
      const override = {
        en: {
          crm: {
            'deals.title': 'Opportunities',
          },
        },
      };
      expect(TenantOverrideSchema.safeParse(override).success).toBe(true);
    });

    it('should accept multiple locales', () => {
      const override = {
        en: { crm: { 'deals.title': 'Opportunities' } },
        it: { crm: { 'deals.title': 'Opportunità' } },
      };
      expect(TenantOverrideSchema.safeParse(override).success).toBe(true);
    });

    it('should accept multiple namespaces', () => {
      const override = {
        en: {
          crm: { 'deals.title': 'Opportunities' },
          billing: { 'invoices.title': 'Bills' },
        },
      };
      expect(TenantOverrideSchema.safeParse(override).success).toBe(true);
    });

    it('should accept empty override object', () => {
      expect(TenantOverrideSchema.safeParse({}).success).toBe(true);
    });

    it('should accept empty locale', () => {
      const override = { en: {} };
      expect(TenantOverrideSchema.safeParse(override).success).toBe(true);
    });

    it('should accept empty namespace', () => {
      const override = { en: { crm: {} } };
      expect(TenantOverrideSchema.safeParse(override).success).toBe(true);
    });
  });

  describe('Invalid override structures', () => {
    it('should reject non-string values', () => {
      const override = {
        en: {
          crm: {
            'deals.title': 123 as any, // Invalid: number instead of string
          },
        },
      };
      expect(TenantOverrideSchema.safeParse(override).success).toBe(false);
    });

    it('should reject array values', () => {
      const override = {
        en: {
          crm: ['invalid'] as any, // Invalid: array instead of object
        },
      };
      expect(TenantOverrideSchema.safeParse(override).success).toBe(false);
    });

    it('should reject null values', () => {
      const override = {
        en: {
          crm: {
            'deals.title': null as any,
          },
        },
      };
      expect(TenantOverrideSchema.safeParse(override).success).toBe(false);
    });
  });
});

describe('TranslationOverridePayloadSchema', () => {
  it('should accept valid payload', () => {
    const payload = {
      overrides: {
        en: { crm: { 'deals.title': 'Opportunities' } },
      },
    };
    expect(TranslationOverridePayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('should reject payload without overrides field', () => {
    const payload = {};
    expect(TranslationOverridePayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('should reject payload with invalid overrides type', () => {
    const payload = { overrides: 'invalid' };
    expect(TranslationOverridePayloadSchema.safeParse(payload).success).toBe(false);
  });
});

describe('GetTranslationsQuerySchema', () => {
  it('should accept empty query', () => {
    expect(GetTranslationsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('should accept query with tenant', () => {
    const query = { tenant: 'acme-corp' };
    expect(GetTranslationsQuerySchema.safeParse(query).success).toBe(true);
  });

  it('should accept query without tenant', () => {
    expect(GetTranslationsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('should reject query with non-string tenant', () => {
    const query = { tenant: 123 };
    expect(GetTranslationsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('GetTranslationsParamsSchema', () => {
  it('should accept valid params', () => {
    const params = { locale: 'en', namespace: 'core' };
    expect(GetTranslationsParamsSchema.safeParse(params).success).toBe(true);
  });

  it('should accept params with region code', () => {
    const params = { locale: 'en-US', namespace: 'advanced-analytics' };
    expect(GetTranslationsParamsSchema.safeParse(params).success).toBe(true);
  });

  it('should reject invalid locale', () => {
    const params = { locale: 'invalid', namespace: 'core' };
    expect(GetTranslationsParamsSchema.safeParse(params).success).toBe(false);
  });

  it('should reject invalid namespace', () => {
    const params = { locale: 'en', namespace: 'Invalid_Namespace' };
    expect(GetTranslationsParamsSchema.safeParse(params).success).toBe(false);
  });

  it('should reject missing locale', () => {
    const params = { namespace: 'core' };
    expect(GetTranslationsParamsSchema.safeParse(params).success).toBe(false);
  });

  it('should reject missing namespace', () => {
    const params = { locale: 'en' };
    expect(GetTranslationsParamsSchema.safeParse(params).success).toBe(false);
  });
});

describe('TranslationBundleResponseSchema', () => {
  it('should accept valid bundle response', () => {
    const response = {
      locale: 'en',
      namespace: 'core',
      hash: 'a1b2c3d4',
      messages: { 'contacts.title': 'Contacts' },
    };
    expect(TranslationBundleResponseSchema.safeParse(response).success).toBe(true);
  });

  it('should accept empty messages', () => {
    const response = {
      locale: 'en',
      namespace: 'core',
      hash: 'a1b2c3d4',
      messages: {},
    };
    expect(TranslationBundleResponseSchema.safeParse(response).success).toBe(true);
  });

  it('should reject missing locale', () => {
    const response = {
      namespace: 'core',
      hash: 'a1b2c3d4',
      messages: {},
    };
    expect(TranslationBundleResponseSchema.safeParse(response).success).toBe(false);
  });

  it('should reject missing hash', () => {
    const response = {
      locale: 'en',
      namespace: 'core',
      messages: {},
    };
    expect(TranslationBundleResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe('AvailableLocalesResponseSchema', () => {
  it('should accept valid locales response', () => {
    const response = {
      locales: [
        { code: 'en', name: 'English', nativeName: 'English', namespaceCount: 5 },
        { code: 'it', name: 'Italian', nativeName: 'Italiano', namespaceCount: 3 },
      ],
      defaultLocale: 'en',
    };
    expect(AvailableLocalesResponseSchema.safeParse(response).success).toBe(true);
  });

  it('should accept empty locales array', () => {
    const response = {
      locales: [],
      defaultLocale: 'en',
    };
    expect(AvailableLocalesResponseSchema.safeParse(response).success).toBe(true);
  });

  it('should reject negative namespaceCount', () => {
    const response = {
      locales: [{ code: 'en', name: 'English', nativeName: 'English', namespaceCount: -1 }],
      defaultLocale: 'en',
    };
    expect(AvailableLocalesResponseSchema.safeParse(response).success).toBe(false);
  });

  it('should reject invalid locale code', () => {
    const response = {
      locales: [{ code: 'invalid', name: 'Invalid', nativeName: 'Invalid', namespaceCount: 0 }],
      defaultLocale: 'en',
    };
    expect(AvailableLocalesResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe('TenantOverridesResponseSchema', () => {
  it('should accept valid overrides response', () => {
    const response = {
      overrides: {
        en: { crm: { 'deals.title': 'Opportunities' } },
      },
      updatedAt: '2026-02-14T10:00:00Z',
    };
    expect(TenantOverridesResponseSchema.safeParse(response).success).toBe(true);
  });

  it('should accept empty overrides', () => {
    const response = {
      overrides: {},
      updatedAt: '2026-02-14T10:00:00Z',
    };
    expect(TenantOverridesResponseSchema.safeParse(response).success).toBe(true);
  });

  it('should reject invalid datetime format', () => {
    const response = {
      overrides: {},
      updatedAt: 'not-a-date',
    };
    expect(TenantOverridesResponseSchema.safeParse(response).success).toBe(false);
  });

  it('should reject missing updatedAt', () => {
    const response = {
      overrides: {},
    };
    expect(TenantOverridesResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe('Integration: Payload size validation (FR-011)', () => {
  it('should accept payload under 1MB', () => {
    const overrides: Record<string, Record<string, Record<string, string>>> = {};
    for (let i = 0; i < 100; i++) {
      overrides[`key${i}`] = { namespace: { [`key${i}`]: 'value' } };
    }
    const payload = { overrides };
    const result = TranslationOverridePayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // Note: Actual 1MB size check is done at HTTP layer (Fastify bodyLimit)
  // This test documents the requirement; size enforcement is infrastructure-level
  it('should document that size check happens at HTTP layer', () => {
    // Actual enforcement: Fastify server with bodyLimit: 1048576 (1MB)
    // This test ensures schema accepts large valid structures
    const largeOverrides: Record<string, Record<string, Record<string, string>>> = {};
    for (let i = 0; i < 1000; i++) {
      largeOverrides[`key${i}`] = { namespace: { [`subkey${i}`]: 'x'.repeat(100) } };
    }
    const payload = { overrides: largeOverrides };
    const result = TranslationOverridePayloadSchema.safeParse(payload);
    // Schema validation passes; size enforcement is at HTTP layer
    expect(result.success).toBe(true);
  });
});
