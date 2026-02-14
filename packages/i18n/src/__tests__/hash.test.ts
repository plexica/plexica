// File: packages/i18n/src/__tests__/hash.test.ts
import { describe, it, expect } from 'vitest';
import { generateContentHash } from '../hash.js';

describe('generateContentHash', () => {
  describe('determinism', () => {
    it('should generate the same hash for the same input', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };

      // Act
      const hash1 = generateContentHash(messages);
      const hash2 = generateContentHash(messages);

      // Assert
      expect(hash1).toBe(hash2);
    });

    it('should generate the same hash regardless of key order', () => {
      // Arrange
      const messages1 = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };
      const messages2 = {
        'common.goodbye': 'Goodbye',
        'common.welcome': 'Welcome',
      };

      // Act
      const hash1 = generateContentHash(messages1);
      const hash2 = generateContentHash(messages2);

      // Assert
      expect(hash1).toBe(hash2);
    });
  });

  describe('uniqueness', () => {
    it('should generate different hashes for different messages', () => {
      // Arrange
      const messages1 = { 'common.welcome': 'Welcome' };
      const messages2 = { 'common.welcome': 'Bienvenue' };

      // Act
      const hash1 = generateContentHash(messages1);
      const hash2 = generateContentHash(messages2);

      // Assert
      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different keys', () => {
      // Arrange
      const messages1 = { 'common.welcome': 'Welcome' };
      const messages2 = { 'common.goodbye': 'Welcome' };

      // Act
      const hash1 = generateContentHash(messages1);
      const hash2 = generateContentHash(messages2);

      // Assert
      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes when keys are added', () => {
      // Arrange
      const messages1 = { 'common.welcome': 'Welcome' };
      const messages2 = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
      };

      // Act
      const hash1 = generateContentHash(messages1);
      const hash2 = generateContentHash(messages2);

      // Assert
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hash format', () => {
    it('should return an 8-character hash', () => {
      // Arrange
      const messages = { 'common.welcome': 'Welcome' };

      // Act
      const hash = generateContentHash(messages);

      // Assert
      expect(hash).toHaveLength(8);
    });

    it('should return a hexadecimal hash', () => {
      // Arrange
      const messages = { 'common.welcome': 'Welcome' };

      // Act
      const hash = generateContentHash(messages);

      // Assert
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages object', () => {
      // Arrange
      const messages = {};

      // Act
      const hash = generateContentHash(messages);

      // Assert
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should handle large messages object', () => {
      // Arrange
      const messages: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        messages[`key${i}`] = `Value ${i}`;
      }

      // Act
      const hash = generateContentHash(messages);

      // Assert
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should handle messages with special characters', () => {
      // Arrange
      const messages = {
        'common.emoji': '👋 Hello',
        'common.unicode': 'Привет',
        'common.symbols': '!@#$%^&*()',
      };

      // Act
      const hash = generateContentHash(messages);

      // Assert
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should handle messages with ICU MessageFormat syntax', () => {
      // Arrange
      const messages = {
        'common.greeting': 'Hello {name}!',
        'common.plural': '{count, plural, one {# item} other {# items}}',
      };

      // Act
      const hash = generateContentHash(messages);

      // Assert
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should handle messages with very long values', () => {
      // Arrange
      const longValue = 'a'.repeat(10000);
      const messages = {
        'common.long': longValue,
      };

      // Act
      const hash = generateContentHash(messages);

      // Assert
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });
  });

  describe('stability', () => {
    it('should generate consistent hashes across multiple calls', () => {
      // Arrange
      const messages = {
        'common.welcome': 'Welcome',
        'common.goodbye': 'Goodbye',
        'common.hello': 'Hello',
      };

      // Act
      const hashes = Array.from({ length: 10 }, () => generateContentHash(messages));

      // Assert
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });
  });
});
