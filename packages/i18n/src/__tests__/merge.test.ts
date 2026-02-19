// File: packages/i18n/src/__tests__/merge.test.ts
import { describe, it, expect } from 'vitest';
import { mergeOverrides } from '../merge.js';

describe('mergeOverrides', () => {
  describe('override precedence', () => {
    it('should replace base values with override values', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };
      const overrides = {
        'common.welcome': 'Custom Welcome',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['common.welcome']).toBe('Custom Welcome');
      expect(result.messages['common.goodbye']).toBe('Goodbye');
    });

    it('should override multiple keys', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
        'common.hello': 'Hello',
      };
      const overrides = {
        'common.welcome': 'Custom Welcome',
        'common.goodbye': 'Custom Goodbye',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['common.welcome']).toBe('Custom Welcome');
      expect(result.messages['common.goodbye']).toBe('Custom Goodbye');
      expect(result.messages['common.hello']).toBe('Hello');
    });

    it('should keep base values when no override exists', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };
      const overrides = {};

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages).toEqual(base);
      expect(result.orphanedKeys).toEqual([]);
    });
  });

  describe('orphaned key detection', () => {
    it('should detect orphaned keys (overrides without matching base)', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
      };
      const overrides = {
        'common.goodbye': 'Custom Goodbye',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['common.welcome']).toBe('Welcome');
      expect(result.messages['common.goodbye']).toBe('Custom Goodbye');
      expect(result.orphanedKeys).toEqual(['common.goodbye']);
    });

    it('should detect multiple orphaned keys', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
      };
      const overrides = {
        'common.goodbye': 'Custom Goodbye',
        'common.hello': 'Custom Hello',
        'common.thanks': 'Custom Thanks',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.orphanedKeys).toEqual(['common.goodbye', 'common.hello', 'common.thanks']);
    });

    it('should detect mixed scenario (some matching, some orphaned)', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };
      const overrides = {
        'common.welcome': 'Custom Welcome', // matches
        'common.hello': 'Custom Hello', // orphaned
        'common.thanks': 'Custom Thanks', // orphaned
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['common.welcome']).toBe('Custom Welcome');
      expect(result.messages['common.goodbye']).toBe('Goodbye');
      expect(result.messages['common.hello']).toBe('Custom Hello');
      expect(result.messages['common.thanks']).toBe('Custom Thanks');
      expect(result.orphanedKeys).toEqual(['common.hello', 'common.thanks']);
    });

    it('should return empty orphanedKeys when all overrides match', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };
      const overrides = {
        'common.welcome': 'Custom Welcome',
        'common.goodbye': 'Custom Goodbye',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.orphanedKeys).toEqual([]);
    });
  });

  describe('empty inputs', () => {
    it('should handle empty base messages', () => {
      // Arrange
      const base = {};
      const overrides = {
        'common.welcome': 'Custom Welcome',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages).toEqual(overrides);
      expect(result.orphanedKeys).toEqual(['common.welcome']);
    });

    it('should handle empty overrides', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };
      const overrides = {};

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages).toEqual(base);
      expect(result.orphanedKeys).toEqual([]);
    });

    it('should handle both empty base and overrides', () => {
      // Arrange
      const base = {};
      const overrides = {};

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages).toEqual({});
      expect(result.orphanedKeys).toEqual([]);
    });
  });

  describe('special characters in keys', () => {
    it('should handle keys with dots', () => {
      // Arrange
      const base = {
        'common.welcome.message': 'Welcome',
      };
      const overrides = {
        'common.welcome.message': 'Custom Welcome',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['common.welcome.message']).toBe('Custom Welcome');
      expect(result.orphanedKeys).toEqual([]);
    });

    it('should handle keys with special characters', () => {
      // Arrange
      const base = {
        'common.welcome-message': 'Welcome',
        'common.goodbye_message': 'Goodbye',
      };
      const overrides = {
        'common.welcome-message': 'Custom Welcome',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['common.welcome-message']).toBe('Custom Welcome');
      expect(result.messages['common.goodbye_message']).toBe('Goodbye');
    });

    it('should handle keys with unicode characters', () => {
      // Arrange
      const base = {
        'common.приветствие': 'Welcome',
        'common.你好': 'Hello',
      };
      const overrides = {
        'common.приветствие': 'Добро пожаловать',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['common.приветствие']).toBe('Добро пожаловать');
      expect(result.messages['common.你好']).toBe('Hello');
    });
  });

  describe('special characters in values', () => {
    it('should handle values with ICU MessageFormat syntax', () => {
      // Arrange
      const base = {
        'common.greeting': 'Hello {name}!',
        'common.plural': '{count, plural, one {# item} other {# items}}',
      };
      const overrides = {
        'common.greeting': 'Welcome {name}!',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['common.greeting']).toBe('Welcome {name}!');
      expect(result.messages['common.plural']).toBe(
        '{count, plural, one {# item} other {# items}}'
      );
    });

    it('should handle values with emoji', () => {
      // Arrange
      const base = {
        'common.welcome': '👋 Welcome',
        'common.goodbye': '👋 Goodbye',
      };
      const overrides = {
        'common.welcome': '🎉 Custom Welcome',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['common.welcome']).toBe('🎉 Custom Welcome');
      expect(result.messages['common.goodbye']).toBe('👋 Goodbye');
    });

    it('should handle values with HTML entities', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome &amp; Hello',
      };
      const overrides = {
        'common.welcome': 'Custom &lt;Welcome&gt;',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['common.welcome']).toBe('Custom &lt;Welcome&gt;');
    });
  });

  describe('pure function behavior', () => {
    it('should not mutate base messages', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };
      const baseCopy = { ...base };
      const overrides = {
        'common.welcome': 'Custom Welcome',
      };

      // Act
      mergeOverrides(base, overrides);

      // Assert
      expect(base).toEqual(baseCopy);
    });

    it('should not mutate override messages', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
      };
      const overrides = {
        'common.goodbye': 'Custom Goodbye',
      };
      const overridesCopy = { ...overrides };

      // Act
      mergeOverrides(base, overrides);

      // Assert
      expect(overrides).toEqual(overridesCopy);
    });

    it('should return new object each time', () => {
      // Arrange
      const base = {
        'common.welcome': 'Welcome',
      };
      const overrides = {
        'common.welcome': 'Custom Welcome',
      };

      // Act
      const result1 = mergeOverrides(base, overrides);
      const result2 = mergeOverrides(base, overrides);

      // Assert
      expect(result1).not.toBe(result2);
      expect(result1.messages).not.toBe(result2.messages);
      expect(result1.orphanedKeys).not.toBe(result2.orphanedKeys);
    });
  });

  describe('large inputs', () => {
    it('should handle large base messages', () => {
      // Arrange
      const base: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        base[`key${i}`] = `Value ${i}`;
      }
      const overrides = {
        key500: 'Custom Value 500',
      };

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['key500']).toBe('Custom Value 500');
      expect(result.messages['key0']).toBe('Value 0');
      expect(result.messages['key999']).toBe('Value 999');
      expect(result.orphanedKeys).toEqual([]);
    });

    it('should handle large overrides', () => {
      // Arrange
      const base = {
        key0: 'Value 0',
      };
      const overrides: Record<string, string> = {};
      for (let i = 1; i < 1000; i++) {
        overrides[`key${i}`] = `Custom Value ${i}`;
      }

      // Act
      const result = mergeOverrides(base, overrides);

      // Assert
      expect(result.messages['key0']).toBe('Value 0');
      expect(result.messages['key1']).toBe('Custom Value 1');
      expect(result.messages['key999']).toBe('Custom Value 999');
      expect(result.orphanedKeys).toHaveLength(999);
    });
  });
});
