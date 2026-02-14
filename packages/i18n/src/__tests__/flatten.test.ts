/**
 * Unit tests for flatten/unflatten utilities
 *
 * Tests translation message flattening and unflattening with edge cases.
 * Coverage target: ≥90%
 */

import { describe, it, expect } from 'vitest';
import { flattenMessages, unflattenMessages } from '../flatten.js';
import type { NamespacedMessages } from '../types.js';

describe('flattenMessages', () => {
  it('should flatten single-level object', () => {
    // Arrange
    const nested: NamespacedMessages = {
      greeting: 'Hello',
      farewell: 'Goodbye',
    };

    // Act
    const result = flattenMessages(nested);

    // Assert
    expect(result).toEqual({
      greeting: 'Hello',
      farewell: 'Goodbye',
    });
  });

  it('should flatten nested object with dotted keys', () => {
    // Arrange
    const nested: NamespacedMessages = {
      dashboard: {
        title: 'Dashboard',
        subtitle: 'Overview',
      },
    };

    // Act
    const result = flattenMessages(nested);

    // Assert
    expect(result).toEqual({
      'dashboard.title': 'Dashboard',
      'dashboard.subtitle': 'Overview',
    });
  });

  it('should flatten deeply nested object (5+ levels)', () => {
    // Arrange
    const nested: NamespacedMessages = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                deepValue: 'Deep!',
              },
            },
          },
        },
      },
    };

    // Act
    const result = flattenMessages(nested);

    // Assert
    expect(result).toEqual({
      'level1.level2.level3.level4.level5.deepValue': 'Deep!',
    });
  });

  it('should flatten complex nested structure', () => {
    // Arrange
    const nested: NamespacedMessages = {
      common: {
        greeting: 'Hello',
        farewell: 'Goodbye',
      },
      dashboard: {
        title: 'Dashboard',
        actions: {
          save: 'Save',
          cancel: 'Cancel',
          delete: 'Delete',
        },
      },
    };

    // Act
    const result = flattenMessages(nested);

    // Assert
    expect(result).toEqual({
      'common.greeting': 'Hello',
      'common.farewell': 'Goodbye',
      'dashboard.title': 'Dashboard',
      'dashboard.actions.save': 'Save',
      'dashboard.actions.cancel': 'Cancel',
      'dashboard.actions.delete': 'Delete',
    });
  });

  it('should handle empty object', () => {
    // Arrange
    const nested: NamespacedMessages = {};

    // Act
    const result = flattenMessages(nested);

    // Assert
    expect(result).toEqual({});
  });

  it('should handle object with empty nested objects', () => {
    // Arrange
    const nested: NamespacedMessages = {
      empty: {},
      notEmpty: {
        value: 'Hello',
      },
    };

    // Act
    const result = flattenMessages(nested);

    // Assert
    expect(result).toEqual({
      'notEmpty.value': 'Hello',
    });
  });

  it('should skip non-string primitive values', () => {
    // Arrange
    const nested: any = {
      string: 'Hello',
      number: 42,
      boolean: true,
      nullValue: null,
      undefinedValue: undefined,
    };

    // Act
    const result = flattenMessages(nested);

    // Assert
    // Only string values should be included
    expect(result).toEqual({
      string: 'Hello',
    });
  });

  it('should handle keys with special characters', () => {
    // Arrange
    const nested: NamespacedMessages = {
      'key-with-dash': 'Value 1',
      key_with_underscore: 'Value 2',
      nested: {
        'special-key': 'Nested value',
      },
    };

    // Act
    const result = flattenMessages(nested);

    // Assert
    expect(result).toEqual({
      'key-with-dash': 'Value 1',
      key_with_underscore: 'Value 2',
      'nested.special-key': 'Nested value',
    });
  });

  it('should preserve ICU MessageFormat syntax', () => {
    // Arrange
    const nested: NamespacedMessages = {
      welcome: 'Welcome, {name}!',
      itemCount: 'You have {count, plural, one {# item} other {# items}}.',
    };

    // Act
    const result = flattenMessages(nested);

    // Assert
    expect(result).toEqual({
      welcome: 'Welcome, {name}!',
      itemCount: 'You have {count, plural, one {# item} other {# items}}.',
    });
  });
});

describe('unflattenMessages', () => {
  it('should unflatten single-level flat object', () => {
    // Arrange
    const flat = {
      greeting: 'Hello',
      farewell: 'Goodbye',
    };

    // Act
    const result = unflattenMessages(flat);

    // Assert
    expect(result).toEqual({
      greeting: 'Hello',
      farewell: 'Goodbye',
    });
  });

  it('should unflatten dotted keys to nested object', () => {
    // Arrange
    const flat = {
      'dashboard.title': 'Dashboard',
      'dashboard.subtitle': 'Overview',
    };

    // Act
    const result = unflattenMessages(flat);

    // Assert
    expect(result).toEqual({
      dashboard: {
        title: 'Dashboard',
        subtitle: 'Overview',
      },
    });
  });

  it('should unflatten deeply nested keys (5+ levels)', () => {
    // Arrange
    const flat = {
      'level1.level2.level3.level4.level5.deepValue': 'Deep!',
    };

    // Act
    const result = unflattenMessages(flat);

    // Assert
    expect(result).toEqual({
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                deepValue: 'Deep!',
              },
            },
          },
        },
      },
    });
  });

  it('should unflatten complex flat structure', () => {
    // Arrange
    const flat = {
      'common.greeting': 'Hello',
      'common.farewell': 'Goodbye',
      'dashboard.title': 'Dashboard',
      'dashboard.actions.save': 'Save',
      'dashboard.actions.cancel': 'Cancel',
    };

    // Act
    const result = unflattenMessages(flat);

    // Assert
    expect(result).toEqual({
      common: {
        greeting: 'Hello',
        farewell: 'Goodbye',
      },
      dashboard: {
        title: 'Dashboard',
        actions: {
          save: 'Save',
          cancel: 'Cancel',
        },
      },
    });
  });

  it('should handle empty object', () => {
    // Arrange
    const flat = {};

    // Act
    const result = unflattenMessages(flat);

    // Assert
    expect(result).toEqual({});
  });

  it('should handle keys with special characters', () => {
    // Arrange
    const flat = {
      'key-with-dash': 'Value 1',
      key_with_underscore: 'Value 2',
      'nested.special-key': 'Nested value',
    };

    // Act
    const result = unflattenMessages(flat);

    // Assert
    expect(result).toEqual({
      'key-with-dash': 'Value 1',
      key_with_underscore: 'Value 2',
      nested: {
        'special-key': 'Nested value',
      },
    });
  });

  it('should preserve ICU MessageFormat syntax', () => {
    // Arrange
    const flat = {
      welcome: 'Welcome, {name}!',
      itemCount: 'You have {count, plural, one {# item} other {# items}}.',
    };

    // Act
    const result = unflattenMessages(flat);

    // Assert
    expect(result).toEqual({
      welcome: 'Welcome, {name}!',
      itemCount: 'You have {count, plural, one {# item} other {# items}}.',
    });
  });
});

describe('Round-trip conversion', () => {
  it('should preserve structure on flatten → unflatten', () => {
    // Arrange
    const original: NamespacedMessages = {
      common: {
        greeting: 'Hello',
        farewell: 'Goodbye',
      },
      dashboard: {
        title: 'Dashboard',
        actions: {
          save: 'Save',
          cancel: 'Cancel',
        },
      },
    };

    // Act
    const flattened = flattenMessages(original);
    const restored = unflattenMessages(flattened);

    // Assert
    expect(restored).toEqual(original);
  });

  it('should preserve structure on unflatten → flatten', () => {
    // Arrange
    const original = {
      'common.greeting': 'Hello',
      'common.farewell': 'Goodbye',
      'dashboard.title': 'Dashboard',
      'dashboard.actions.save': 'Save',
    };

    // Act
    const unflattened = unflattenMessages(original);
    const restored = flattenMessages(unflattened);

    // Assert
    expect(restored).toEqual(original);
  });

  it('should handle round-trip with deeply nested structure', () => {
    // Arrange
    const original: NamespacedMessages = {
      a: {
        b: {
          c: {
            d: {
              e: 'Value',
            },
          },
        },
      },
    };

    // Act
    const flattened = flattenMessages(original);
    const restored = unflattenMessages(flattened);

    // Assert
    expect(restored).toEqual(original);
    expect(flattened).toEqual({ 'a.b.c.d.e': 'Value' });
  });
});
