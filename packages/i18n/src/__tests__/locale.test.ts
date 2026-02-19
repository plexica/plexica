// File: packages/i18n/src/__tests__/locale.test.ts
import { describe, it, expect } from 'vitest';
import { resolveLocale, isValidLocale } from '../locale.js';

describe('isValidLocale', () => {
  describe('valid BCP 47 locales', () => {
    it('should accept two-letter language codes', () => {
      // Arrange & Act & Assert
      expect(isValidLocale('en')).toBe(true);
      expect(isValidLocale('it')).toBe(true);
      expect(isValidLocale('fr')).toBe(true);
      expect(isValidLocale('de')).toBe(true);
      expect(isValidLocale('zh')).toBe(true);
    });

    it('should accept three-letter language codes', () => {
      // Arrange & Act & Assert
      expect(isValidLocale('eng')).toBe(true);
      expect(isValidLocale('ita')).toBe(true);
      expect(isValidLocale('fra')).toBe(true);
    });

    it('should accept language-region format', () => {
      // Arrange & Act & Assert
      expect(isValidLocale('en-US')).toBe(true);
      expect(isValidLocale('it-IT')).toBe(true);
      expect(isValidLocale('fr-FR')).toBe(true);
      expect(isValidLocale('de-DE')).toBe(true);
      expect(isValidLocale('zh-CN')).toBe(true);
    });

    it('should accept language-script-region format', () => {
      // Arrange & Act & Assert
      expect(isValidLocale('zh-Hans-CN')).toBe(true);
      expect(isValidLocale('zh-Hant-TW')).toBe(true);
      expect(isValidLocale('en-Latn-US')).toBe(true);
    });

    it('should accept language-script format', () => {
      // Arrange & Act & Assert
      expect(isValidLocale('zh-Hans')).toBe(true);
      expect(isValidLocale('zh-Hant')).toBe(true);
      expect(isValidLocale('sr-Cyrl')).toBe(true);
    });
  });

  describe('invalid locales', () => {
    it('should reject invalid formats', () => {
      // Arrange & Act & Assert
      expect(isValidLocale('invalid')).toBe(false);
      expect(isValidLocale('EN')).toBe(false); // uppercase language code
      expect(isValidLocale('en_US')).toBe(false); // underscore instead of hyphen
      expect(isValidLocale('en-us')).toBe(false); // lowercase region
      expect(isValidLocale('e')).toBe(false); // single character
      expect(isValidLocale('engl')).toBe(false); // four-letter language code
    });

    it('should reject empty strings', () => {
      // Arrange & Act & Assert
      expect(isValidLocale('')).toBe(false);
    });

    it('should reject strings with extra parts', () => {
      // Arrange & Act & Assert
      expect(isValidLocale('en-US-extra')).toBe(false);
      expect(isValidLocale('zh-Hans-CN-extra')).toBe(false);
    });

    it('should reject locales with invalid separators', () => {
      // Arrange & Act & Assert
      expect(isValidLocale('en_US')).toBe(false);
      expect(isValidLocale('en.US')).toBe(false);
      expect(isValidLocale('en/US')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined', () => {
      // Arrange & Act & Assert
      expect(isValidLocale(null as any)).toBe(false);
      expect(isValidLocale(undefined as any)).toBe(false);
    });

    it('should handle non-string values', () => {
      // Arrange & Act & Assert
      expect(isValidLocale(123 as any)).toBe(false);
      expect(isValidLocale({} as any)).toBe(false);
      expect(isValidLocale([] as any)).toBe(false);
    });
  });
});

describe('resolveLocale', () => {
  describe('priority chain', () => {
    it('should prioritize browser locale when valid', () => {
      // Arrange
      const options = {
        browserLocale: 'fr-FR',
        userLocale: 'de-DE',
        tenantDefaultLocale: 'it-IT',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('fr-FR');
    });

    it('should fall back to user locale when browser locale is invalid', () => {
      // Arrange
      const options = {
        browserLocale: 'invalid',
        userLocale: 'de-DE',
        tenantDefaultLocale: 'it-IT',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('de-DE');
    });

    it('should fall back to tenant default when browser and user locales are invalid', () => {
      // Arrange
      const options = {
        browserLocale: 'invalid',
        userLocale: 'INVALID',
        tenantDefaultLocale: 'it-IT',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('it-IT');
    });

    it('should fall back to "en" when all locales are invalid', () => {
      // Arrange
      const options = {
        browserLocale: 'invalid',
        userLocale: 'INVALID',
        tenantDefaultLocale: 'also-invalid',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('en');
    });

    it('should skip undefined locales in priority chain', () => {
      // Arrange
      const options = {
        browserLocale: undefined,
        userLocale: 'de-DE',
        tenantDefaultLocale: 'it-IT',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('de-DE');
    });

    it('should skip empty string locales in priority chain', () => {
      // Arrange
      const options = {
        browserLocale: '',
        userLocale: '',
        tenantDefaultLocale: 'it-IT',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('it-IT');
    });
  });

  describe('fallback to English', () => {
    it('should return "en" when all options are undefined', () => {
      // Arrange
      const options = {
        browserLocale: undefined,
        userLocale: undefined,
        tenantDefaultLocale: undefined,
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('en');
    });

    it('should return "en" when all options are invalid', () => {
      // Arrange
      const options = {
        browserLocale: 'INVALID',
        userLocale: 'NOT_VALID',
        tenantDefaultLocale: 'also-invalid',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('en');
    });

    it('should return "en" when no options are provided', () => {
      // Arrange
      const options = {};

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('en');
    });

    it('should return "en" when all options are empty strings', () => {
      // Arrange
      const options = {
        browserLocale: '',
        userLocale: '',
        tenantDefaultLocale: '',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('en');
    });
  });

  describe('partial options', () => {
    it('should work with only browser locale', () => {
      // Arrange
      const options = {
        browserLocale: 'fr-FR',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('fr-FR');
    });

    it('should work with only user locale', () => {
      // Arrange
      const options = {
        userLocale: 'de-DE',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('de-DE');
    });

    it('should work with only tenant default locale', () => {
      // Arrange
      const options = {
        tenantDefaultLocale: 'it-IT',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('it-IT');
    });

    it('should work with browser and user locales only', () => {
      // Arrange
      const options = {
        browserLocale: 'fr-FR',
        userLocale: 'de-DE',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('fr-FR');
    });

    it('should work with user and tenant locales only', () => {
      // Arrange
      const options = {
        userLocale: 'de-DE',
        tenantDefaultLocale: 'it-IT',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('de-DE');
    });
  });

  describe('validation in priority chain', () => {
    it('should validate each locale in the chain', () => {
      // Arrange
      const options = {
        browserLocale: 'en_US', // invalid (underscore)
        userLocale: 'de-DE', // valid
        tenantDefaultLocale: 'it-IT',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('de-DE');
    });

    it('should accept various valid BCP 47 formats', () => {
      // Arrange & Act & Assert
      expect(resolveLocale({ browserLocale: 'en' })).toBe('en');
      expect(resolveLocale({ browserLocale: 'en-US' })).toBe('en-US');
      expect(resolveLocale({ browserLocale: 'zh-Hans-CN' })).toBe('zh-Hans-CN');
      expect(resolveLocale({ browserLocale: 'zh-Hans' })).toBe('zh-Hans');
    });
  });

  describe('edge cases', () => {
    it('should handle options with non-string values', () => {
      // Arrange
      const options = {
        browserLocale: 123 as any,
        userLocale: {} as any,
        tenantDefaultLocale: [] as any,
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('en');
    });

    it('should handle mixed valid and invalid locales', () => {
      // Arrange
      const options = {
        browserLocale: 'INVALID',
        userLocale: 'fr-FR',
        tenantDefaultLocale: 'invalid',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('fr-FR');
    });

    it('should return valid locale even if lower priority locales are invalid', () => {
      // Arrange
      const options = {
        browserLocale: 'en-US',
        userLocale: 'invalid',
        tenantDefaultLocale: 'also-invalid',
      };

      // Act
      const result = resolveLocale(options);

      // Assert
      expect(result).toBe('en-US');
    });
  });
});
