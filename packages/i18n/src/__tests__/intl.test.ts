// File: packages/i18n/src/__tests__/intl.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createNamespacedIntl } from '../intl.js';

describe('createNamespacedIntl', () => {
  beforeEach(() => {
    // Clear console mocks before each test
    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should return IntlShape with FormatJS methods', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
      };

      // Act
      const intl = createNamespacedIntl('en', 'common', messages);

      // Assert
      expect(intl).toBeDefined();
      expect(typeof intl.formatMessage).toBe('function');
      expect(typeof intl.formatNumber).toBe('function');
      expect(typeof intl.formatDate).toBe('function');
      expect(intl.locale).toBe('en');
    });

    it('should format simple messages', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const welcome = intl.formatMessage({ id: 'common.welcome' });
      const goodbye = intl.formatMessage({ id: 'common.goodbye' });

      // Assert
      expect(welcome).toBe('Welcome');
      expect(goodbye).toBe('Goodbye');
    });
  });

  describe('ICU MessageFormat interpolation', () => {
    it('should interpolate single variable', () => {
      // Arrange
      const messages = {
        'common.greeting': 'Hello {name}!',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const result = intl.formatMessage({ id: 'common.greeting' }, { name: 'John' });

      // Assert
      expect(result).toBe('Hello John!');
    });

    it('should interpolate multiple variables', () => {
      // Arrange
      const messages = {
        'common.greeting': 'Hello {firstName} {lastName}!',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const result = intl.formatMessage(
        { id: 'common.greeting' },
        { firstName: 'John', lastName: 'Doe' }
      );

      // Assert
      expect(result).toBe('Hello John Doe!');
    });

    it('should handle missing interpolation values', () => {
      // Arrange
      const messages = {
        'common.greeting': 'Hello {name}!',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const result = intl.formatMessage({ id: 'common.greeting' }, {});

      // Assert
      // FormatJS leaves placeholder when value is missing
      expect(result).toContain('name');
    });

    it('should handle numeric interpolation', () => {
      // Arrange
      const messages = {
        'common.count': 'You have {count} items',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const result = intl.formatMessage({ id: 'common.count' }, { count: 42 });

      // Assert
      expect(result).toBe('You have 42 items');
    });
  });

  describe('ICU MessageFormat pluralization', () => {
    it('should handle simple pluralization (one/other)', () => {
      // Arrange
      const messages = {
        'common.items': '{count, plural, one {# item} other {# items}}',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const singular = intl.formatMessage({ id: 'common.items' }, { count: 1 });
      const plural = intl.formatMessage({ id: 'common.items' }, { count: 5 });

      // Assert
      expect(singular).toBe('1 item');
      expect(plural).toBe('5 items');
    });

    it('should handle zero pluralization', () => {
      // Arrange
      const messages = {
        'common.items': '{count, plural, zero {no items} one {# item} other {# items}}',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const zero = intl.formatMessage({ id: 'common.items' }, { count: 0 });

      // Assert
      // Note: English locale uses "other" for 0, not "zero"
      expect(zero).toBe('0 items');
    });

    it('should handle complex pluralization with text', () => {
      // Arrange
      const messages = {
        'common.notifications':
          'You have {count, plural, zero {no new notifications} one {# new notification} other {# new notifications}}',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const zero = intl.formatMessage({ id: 'common.notifications' }, { count: 0 });
      const one = intl.formatMessage({ id: 'common.notifications' }, { count: 1 });
      const many = intl.formatMessage({ id: 'common.notifications' }, { count: 10 });

      // Assert
      // Note: English locale uses "other" for 0, not "zero"
      expect(zero).toBe('You have 0 new notifications');
      expect(one).toBe('You have 1 new notification');
      expect(many).toBe('You have 10 new notifications');
    });

    it('should handle pluralization with different locales', () => {
      // Arrange
      const messagesEn = {
        'common.items': '{count, plural, one {# item} other {# items}}',
      };
      const messagesFr = {
        'common.items': '{count, plural, one {# élément} other {# éléments}}',
      };
      const intlEn = createNamespacedIntl('en', 'common', messagesEn);
      const intlFr = createNamespacedIntl('fr', 'common', messagesFr);

      // Act
      const enSingular = intlEn.formatMessage({ id: 'common.items' }, { count: 1 });
      const frSingular = intlFr.formatMessage({ id: 'common.items' }, { count: 1 });

      // Assert
      expect(enSingular).toBe('1 item');
      expect(frSingular).toBe('1 élément');
    });
  });

  describe('ICU MessageFormat select expressions', () => {
    it('should handle select expressions', () => {
      // Arrange
      const messages = {
        'common.status':
          '{status, select, active {Active User} inactive {Inactive User} other {Unknown}}',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const active = intl.formatMessage({ id: 'common.status' }, { status: 'active' });
      const inactive = intl.formatMessage({ id: 'common.status' }, { status: 'inactive' });
      const unknown = intl.formatMessage({ id: 'common.status' }, { status: 'pending' });

      // Assert
      expect(active).toBe('Active User');
      expect(inactive).toBe('Inactive User');
      expect(unknown).toBe('Unknown');
    });

    it('should handle select with interpolation', () => {
      // Arrange
      const messages = {
        'common.greeting':
          '{gender, select, male {Hello Mr. {name}} female {Hello Ms. {name}} other {Hello {name}}}',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const male = intl.formatMessage({ id: 'common.greeting' }, { gender: 'male', name: 'Smith' });
      const female = intl.formatMessage(
        { id: 'common.greeting' },
        { gender: 'female', name: 'Johnson' }
      );
      const other = intl.formatMessage({ id: 'common.greeting' }, { gender: 'other', name: 'Doe' });

      // Assert
      expect(male).toBe('Hello Mr. Smith');
      expect(female).toBe('Hello Ms. Johnson');
      expect(other).toBe('Hello Doe');
    });
  });

  describe('tenant overrides', () => {
    it('should apply tenant overrides', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };
      const overrides = {
        'common.welcome': 'Custom Welcome',
      };
      const intl = createNamespacedIntl('en', 'common', messages, overrides);

      // Act
      const welcome = intl.formatMessage({ id: 'common.welcome' });
      const goodbye = intl.formatMessage({ id: 'common.goodbye' });

      // Assert
      expect(welcome).toBe('Custom Welcome');
      expect(goodbye).toBe('Goodbye');
    });

    it('should apply multiple overrides', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
        'common.hello': 'Hello',
      };
      const overrides = {
        'common.welcome': 'Custom Welcome',
        'common.goodbye': 'Custom Goodbye',
      };
      const intl = createNamespacedIntl('en', 'common', messages, overrides);

      // Act
      const welcome = intl.formatMessage({ id: 'common.welcome' });
      const goodbye = intl.formatMessage({ id: 'common.goodbye' });
      const hello = intl.formatMessage({ id: 'common.hello' });

      // Assert
      expect(welcome).toBe('Custom Welcome');
      expect(goodbye).toBe('Custom Goodbye');
      expect(hello).toBe('Hello');
    });

    it('should work without overrides', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const welcome = intl.formatMessage({ id: 'common.welcome' });

      // Assert
      expect(welcome).toBe('Welcome');
    });

    it('should handle empty overrides', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
      };
      const intl = createNamespacedIntl('en', 'common', messages, {});

      // Act
      const welcome = intl.formatMessage({ id: 'common.welcome' });

      // Assert
      expect(welcome).toBe('Welcome');
    });
  });

  describe('missing translation keys', () => {
    it('should return key for missing translation', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const result = intl.formatMessage({ id: 'common.missing' });

      // Assert
      expect(result).toBe('common.missing');
    });

    it('should return key for missing nested translation', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const result = intl.formatMessage({ id: 'common.deeply.nested.missing' });

      // Assert
      expect(result).toBe('common.deeply.nested.missing');
    });

    it('should handle empty messages object', () => {
      // Arrange
      const intl = createNamespacedIntl('en', 'common', {});

      // Act
      const result = intl.formatMessage({ id: 'common.welcome' });

      // Assert
      expect(result).toBe('common.welcome');
    });
  });

  describe('multiple locales', () => {
    it('should create separate IntlShape instances for different locales', () => {
      // Arrange
      const messagesEn = {
        'common.welcome': 'Welcome',
      };
      const messagesFr = {
        'common.welcome': 'Bienvenue',
      };

      // Act
      const intlEn = createNamespacedIntl('en', 'common', messagesEn);
      const intlFr = createNamespacedIntl('fr', 'common', messagesFr);

      // Assert
      expect(intlEn.locale).toBe('en');
      expect(intlFr.locale).toBe('fr');
      expect(intlEn.formatMessage({ id: 'common.welcome' })).toBe('Welcome');
      expect(intlFr.formatMessage({ id: 'common.welcome' })).toBe('Bienvenue');
    });

    it('should support language-region locales', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
      };

      // Act
      const intlUs = createNamespacedIntl('en-US', 'common', messages);
      const intlGb = createNamespacedIntl('en-GB', 'common', messages);

      // Assert
      expect(intlUs.locale).toBe('en-US');
      expect(intlGb.locale).toBe('en-GB');
    });

    it('should support language-script-region locales', () => {
      // Arrange
      const messages = {
        'common.welcome': '欢迎',
      };

      // Act
      const intl = createNamespacedIntl('zh-Hans-CN', 'common', messages);

      // Assert
      expect(intl.locale).toBe('zh-Hans-CN');
      expect(intl.formatMessage({ id: 'common.welcome' })).toBe('欢迎');
    });
  });

  describe('FormatJS number formatting', () => {
    it('should format numbers', () => {
      // Arrange
      const messages = {};
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const result = intl.formatNumber(1234567.89);

      // Assert
      expect(result).toBe('1,234,567.89');
    });

    it('should format numbers with different locales', () => {
      // Arrange
      const messages = {};
      const intlEn = createNamespacedIntl('en', 'common', messages);
      const intlFr = createNamespacedIntl('fr', 'common', messages);

      // Act
      const resultEn = intlEn.formatNumber(1234567.89);
      const resultFr = intlFr.formatNumber(1234567.89);

      // Assert
      expect(resultEn).toBe('1,234,567.89');
      expect(resultFr).toMatch(/1\s?234\s?567[.,]89/); // French uses space or narrow no-break space
    });

    it('should format currency', () => {
      // Arrange
      const messages = {};
      const intl = createNamespacedIntl('en-US', 'common', messages);

      // Act
      const result = intl.formatNumber(1234.56, {
        style: 'currency',
        currency: 'USD',
      });

      // Assert
      expect(result).toContain('1,234.56');
      expect(result).toContain('$');
    });
  });

  describe('FormatJS date formatting', () => {
    it('should format dates', () => {
      // Arrange
      const messages = {};
      const intl = createNamespacedIntl('en', 'common', messages);
      const date = new Date('2026-02-13T12:00:00Z');

      // Act
      const result = intl.formatDate(date);

      // Assert
      expect(result).toContain('2026');
      expect(result).toMatch(/Feb|2/);
    });

    it('should format dates with different locales', () => {
      // Arrange
      const messages = {};
      const intlEn = createNamespacedIntl('en-US', 'common', messages);
      const intlFr = createNamespacedIntl('fr-FR', 'common', messages);
      const date = new Date('2026-02-13T12:00:00Z');

      // Act
      const resultEn = intlEn.formatDate(date);
      const resultFr = intlFr.formatDate(date);

      // Assert
      expect(resultEn).toBeDefined();
      expect(resultFr).toBeDefined();
      // Different locales will format dates differently
      expect(resultEn).not.toBe(resultFr);
    });
  });

  describe('edge cases', () => {
    it('should handle messages with special characters', () => {
      // Arrange
      const messages = {
        'common.emoji': '👋 Welcome!',
        'common.unicode': 'Привет мир',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const emoji = intl.formatMessage({ id: 'common.emoji' });
      const unicode = intl.formatMessage({ id: 'common.unicode' });

      // Assert
      expect(emoji).toBe('👋 Welcome!');
      expect(unicode).toBe('Привет мир');
    });

    it('should handle very long messages', () => {
      // Arrange
      const longMessage = 'a'.repeat(10000);
      const messages = {
        'common.long': longMessage,
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const result = intl.formatMessage({ id: 'common.long' });

      // Assert
      expect(result).toBe(longMessage);
    });

    it('should handle messages with HTML entities', () => {
      // Arrange
      const messages = {
        'common.html': 'Welcome &amp; Hello &lt;world&gt;',
      };
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const result = intl.formatMessage({ id: 'common.html' });

      // Assert
      expect(result).toBe('Welcome &amp; Hello &lt;world&gt;');
    });

    it('should handle large number of messages', () => {
      // Arrange
      const messages: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        messages[`key${i}`] = `Value ${i}`;
      }
      const intl = createNamespacedIntl('en', 'common', messages);

      // Act
      const result0 = intl.formatMessage({ id: 'key0' });
      const result500 = intl.formatMessage({ id: 'key500' });
      const result999 = intl.formatMessage({ id: 'key999' });

      // Assert
      expect(result0).toBe('Value 0');
      expect(result500).toBe('Value 500');
      expect(result999).toBe('Value 999');
    });
  });
});
