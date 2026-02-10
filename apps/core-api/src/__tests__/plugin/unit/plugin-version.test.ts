/**
 * Plugin Version Validation Tests (Phase 5, Task 5.2)
 *
 * Unit tests for plugin version validation, comparison, and compatibility checking.
 * Covers semver parsing, version constraints, upgrade/downgrade logic.
 */

import { describe, it, expect } from 'vitest';
import {
  isValidSemverVersion,
  parseSemverVersion,
  compareSemverVersions,
  satisfiesSemverConstraint,
} from '../../../lib/semver.js';

describe('Plugin Version Validation', () => {
  describe('isValidSemverVersion', () => {
    it('should validate correct semver versions', () => {
      const validVersions = [
        '1.0.0',
        '0.1.0',
        '0.0.1',
        '10.20.30',
        '1.2.3-beta',
        '1.2.3-beta.1',
        '1.2.3-rc.1',
        '1.2.3-alpha',
        '1.2.3-alpha.1+001',
        '2.0.0+build.123',
      ];

      validVersions.forEach((version) => {
        expect(isValidSemverVersion(version)).toBe(true);
      });
    });

    it('should reject invalid semver versions', () => {
      const invalidVersions = [
        'v1.0.0', // v prefix
        '1.0', // missing patch
        '1', // missing minor and patch
        '1.0.0.0', // too many components
        'latest',
        'stable',
        '1.0.0-',
        '1.0.0+',
        '',
        'abc',
      ];

      invalidVersions.forEach((version) => {
        expect(isValidSemverVersion(version)).toBe(false);
      });
    });
  });

  describe('parseSemverVersion', () => {
    it('should parse basic semver versions', () => {
      const result = parseSemverVersion('1.2.3');
      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: undefined,
        build: undefined,
      });
    });

    it('should parse version with prerelease', () => {
      const result = parseSemverVersion('2.0.0-beta.1');
      expect(result).toEqual({
        major: 2,
        minor: 0,
        patch: 0,
        prerelease: 'beta.1',
        build: undefined,
      });
    });

    it('should parse version with build metadata', () => {
      const result = parseSemverVersion('1.0.0+build.123');
      expect(result).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: undefined,
        build: 'build.123',
      });
    });

    it('should parse version with prerelease and build', () => {
      const result = parseSemverVersion('1.2.3-alpha+001');
      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: 'alpha',
        build: '001',
      });
    });

    it('should return null for invalid versions', () => {
      expect(parseSemverVersion('v1.0.0')).toBeNull();
      expect(parseSemverVersion('1.0')).toBeNull();
      expect(parseSemverVersion('invalid')).toBeNull();
    });
  });

  describe('compareSemverVersions', () => {
    it('should compare major versions', () => {
      expect(compareSemverVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareSemverVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareSemverVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should compare minor versions when major is equal', () => {
      expect(compareSemverVersions('1.2.0', '1.1.0')).toBe(1);
      expect(compareSemverVersions('1.1.0', '1.2.0')).toBe(-1);
      expect(compareSemverVersions('1.1.0', '1.1.0')).toBe(0);
    });

    it('should compare patch versions when major and minor are equal', () => {
      expect(compareSemverVersions('1.2.3', '1.2.2')).toBe(1);
      expect(compareSemverVersions('1.2.2', '1.2.3')).toBe(-1);
      expect(compareSemverVersions('1.2.3', '1.2.3')).toBe(0);
    });

    it('should treat prerelease as lower precedence than release', () => {
      expect(compareSemverVersions('1.0.0', '1.0.0-beta')).toBe(1);
      expect(compareSemverVersions('1.0.0-beta', '1.0.0')).toBe(-1);
    });

    it('should compare prerelease versions lexicographically', () => {
      expect(compareSemverVersions('1.0.0-beta', '1.0.0-alpha')).toBe(1);
      expect(compareSemverVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
      expect(compareSemverVersions('1.0.0-rc.1', '1.0.0-rc.2')).toBe(-1);
    });

    it('should throw error for invalid versions', () => {
      expect(() => compareSemverVersions('invalid', '1.0.0')).toThrow();
      expect(() => compareSemverVersions('1.0.0', 'v1.0.0')).toThrow();
    });

    it('should correctly order a sequence of versions', () => {
      const versions = ['1.0.0-alpha', '1.0.0-beta', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];

      for (let i = 0; i < versions.length - 1; i++) {
        expect(compareSemverVersions(versions[i], versions[i + 1])).toBe(-1);
        expect(compareSemverVersions(versions[i + 1], versions[i])).toBe(1);
      }
    });
  });

  describe('satisfiesSemverConstraint', () => {
    describe('exact version constraints', () => {
      it('should match exact version with = prefix', () => {
        expect(satisfiesSemverConstraint('1.0.0', '=1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('1.0.0', '=1.0.1')).toBe(false);
      });

      it('should match exact version without prefix', () => {
        expect(satisfiesSemverConstraint('1.2.3', '1.2.3')).toBe(true);
        expect(satisfiesSemverConstraint('1.2.3', '1.2.4')).toBe(false);
      });
    });

    describe('caret (^) constraints', () => {
      it('should allow minor and patch updates for major > 0', () => {
        expect(satisfiesSemverConstraint('1.0.0', '^1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('1.2.3', '^1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('1.9.9', '^1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('2.0.0', '^1.0.0')).toBe(false);
      });

      it('should enforce lower bound for caret constraints', () => {
        // ^1.2.3 means >=1.2.3 <2.0.0
        expect(satisfiesSemverConstraint('1.2.3', '^1.2.3')).toBe(true);
        expect(satisfiesSemverConstraint('1.2.4', '^1.2.3')).toBe(true);
        expect(satisfiesSemverConstraint('1.3.0', '^1.2.3')).toBe(true);
        expect(satisfiesSemverConstraint('1.2.2', '^1.2.3')).toBe(false);
        expect(satisfiesSemverConstraint('1.1.0', '^1.2.3')).toBe(false);
        expect(satisfiesSemverConstraint('1.0.0', '^1.2.3')).toBe(false);
      });

      it('should allow patch updates for 0.minor.patch', () => {
        expect(satisfiesSemverConstraint('0.1.0', '^0.1.0')).toBe(true);
        expect(satisfiesSemverConstraint('0.1.5', '^0.1.0')).toBe(true);
        expect(satisfiesSemverConstraint('0.2.0', '^0.1.0')).toBe(false);
      });

      it('should enforce lower bound for 0.minor.patch caret', () => {
        // ^0.2.3 means >=0.2.3 <0.3.0
        expect(satisfiesSemverConstraint('0.2.3', '^0.2.3')).toBe(true);
        expect(satisfiesSemverConstraint('0.2.4', '^0.2.3')).toBe(true);
        expect(satisfiesSemverConstraint('0.2.2', '^0.2.3')).toBe(false);
      });

      it('should allow exact match only for 0.0.patch', () => {
        expect(satisfiesSemverConstraint('0.0.1', '^0.0.1')).toBe(true);
        expect(satisfiesSemverConstraint('0.0.2', '^0.0.1')).toBe(false);
      });
    });

    describe('tilde (~) constraints', () => {
      it('should allow patch-level changes', () => {
        expect(satisfiesSemverConstraint('1.2.3', '~1.2.3')).toBe(true);
        expect(satisfiesSemverConstraint('1.2.4', '~1.2.3')).toBe(true);
        expect(satisfiesSemverConstraint('1.2.9', '~1.2.3')).toBe(true);
        expect(satisfiesSemverConstraint('1.3.0', '~1.2.3')).toBe(false);
      });

      it('should not allow minor updates', () => {
        expect(satisfiesSemverConstraint('1.3.0', '~1.2.0')).toBe(false);
        expect(satisfiesSemverConstraint('2.0.0', '~1.9.0')).toBe(false);
      });
    });

    describe('comparison operators', () => {
      it('should support >= operator', () => {
        expect(satisfiesSemverConstraint('1.0.0', '>=1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('1.0.1', '>=1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('2.0.0', '>=1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('0.9.0', '>=1.0.0')).toBe(false);
      });

      it('should support > operator', () => {
        expect(satisfiesSemverConstraint('1.0.1', '>1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('1.0.0', '>1.0.0')).toBe(false);
        expect(satisfiesSemverConstraint('0.9.0', '>1.0.0')).toBe(false);
      });

      it('should support <= operator', () => {
        expect(satisfiesSemverConstraint('1.0.0', '<=1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('0.9.0', '<=1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('1.0.1', '<=1.0.0')).toBe(false);
      });

      it('should support < operator', () => {
        expect(satisfiesSemverConstraint('0.9.0', '<1.0.0')).toBe(true);
        expect(satisfiesSemverConstraint('1.0.0', '<1.0.0')).toBe(false);
        expect(satisfiesSemverConstraint('1.0.1', '<1.0.0')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for invalid version', () => {
        expect(satisfiesSemverConstraint('invalid', '^1.0.0')).toBe(false);
        expect(satisfiesSemverConstraint('v1.0.0', '>=1.0.0')).toBe(false);
      });

      it('should return false for unsupported constraint syntax', () => {
        expect(satisfiesSemverConstraint('1.0.0', 'latest')).toBe(false);
        expect(satisfiesSemverConstraint('1.0.0', '*')).toBe(false);
      });
    });
  });
});
