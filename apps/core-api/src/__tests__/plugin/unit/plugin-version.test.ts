/**
 * Plugin Version Validation Tests (Phase 5, Task 5.2)
 *
 * Unit tests for plugin version validation, comparison, and compatibility checking.
 * Covers semver parsing, version constraints, upgrade/downgrade logic.
 */

import { describe, it, expect } from 'vitest';

/**
 * Semver version validation regex
 * Matches: 1.0.0, 1.2.3-beta, 2.0.0-rc.1, 3.0.0-alpha+001
 */
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9\-\.]+)?(\+[a-zA-Z0-9\-\.]+)?$/;

/**
 * Validates if a string is a valid semver version
 */
function isValidSemverVersion(version: string): boolean {
  return SEMVER_REGEX.test(version);
}

/**
 * Parses a semver version into components
 */
function parseSemverVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
} | null {
  if (!isValidSemverVersion(version)) {
    return null;
  }

  const match = version.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9\-\.]+))?(?:\+([a-zA-Z0-9\-\.]+))?$/
  );
  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
  };
}

/**
 * Compares two semver versions
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
function compareSemverVersions(v1: string, v2: string): number {
  const parsed1 = parseSemverVersion(v1);
  const parsed2 = parseSemverVersion(v2);

  if (!parsed1 || !parsed2) {
    throw new Error('Invalid semver version');
  }

  // Compare major.minor.patch
  if (parsed1.major !== parsed2.major) {
    return parsed1.major > parsed2.major ? 1 : -1;
  }
  if (parsed1.minor !== parsed2.minor) {
    return parsed1.minor > parsed2.minor ? 1 : -1;
  }
  if (parsed1.patch !== parsed2.patch) {
    return parsed1.patch > parsed2.patch ? 1 : -1;
  }

  // If versions are equal without prerelease, they're equal
  if (!parsed1.prerelease && !parsed2.prerelease) {
    return 0;
  }

  // Versions with prerelease have lower precedence than normal versions
  if (!parsed1.prerelease) return 1;
  if (!parsed2.prerelease) return -1;

  // Compare prerelease versions lexicographically
  if (parsed1.prerelease < parsed2.prerelease) return -1;
  if (parsed1.prerelease > parsed2.prerelease) return 1;

  return 0;
}

/**
 * Checks if a version satisfies a semver constraint
 * Supports: ^1.0.0, ~1.2.3, >=2.0.0, >1.0.0, <=3.0.0, <4.0.0, =1.0.0, 1.0.0
 */
function satisfiesSemverConstraint(version: string, constraint: string): boolean {
  const parsed = parseSemverVersion(version);
  if (!parsed) {
    return false;
  }

  // Exact match (=1.0.0 or 1.0.0)
  const exactMatch = constraint.match(/^=?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9\-\.]+)?)$/);
  if (exactMatch) {
    return version === exactMatch[1];
  }

  // Caret (^) - allows changes that do not modify left-most non-zero digit
  const caretMatch = constraint.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
  if (caretMatch) {
    const [, major, minor, patch] = caretMatch.map(Number);
    if (parsed.major !== major) return false;
    if (major > 0) return true; // ^1.0.0 allows >=1.0.0 <2.0.0
    if (parsed.minor !== minor) return false;
    if (minor > 0) return true; // ^0.1.0 allows >=0.1.0 <0.2.0
    return parsed.patch === patch; // ^0.0.1 allows only =0.0.1
  }

  // Tilde (~) - allows patch-level changes
  const tildeMatch = constraint.match(/^~(\d+)\.(\d+)\.(\d+)$/);
  if (tildeMatch) {
    const [, major, minor, patch] = tildeMatch.map(Number);
    return parsed.major === major && parsed.minor === minor && parsed.patch >= patch;
  }

  // Comparison operators (>=, >, <=, <)
  const comparisonMatch = constraint.match(/^(>=|>|<=|<)(\d+\.\d+\.\d+(?:-[a-zA-Z0-9\-\.]+)?)$/);
  if (comparisonMatch) {
    const operator = comparisonMatch[1];
    const targetVersion = comparisonMatch[2];
    const comparison = compareSemverVersions(version, targetVersion);

    switch (operator) {
      case '>=':
        return comparison >= 0;
      case '>':
        return comparison > 0;
      case '<=':
        return comparison <= 0;
      case '<':
        return comparison < 0;
      default:
        return false;
    }
  }

  return false;
}

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

      it('should allow patch updates for 0.minor.patch', () => {
        expect(satisfiesSemverConstraint('0.1.0', '^0.1.0')).toBe(true);
        expect(satisfiesSemverConstraint('0.1.5', '^0.1.0')).toBe(true);
        expect(satisfiesSemverConstraint('0.2.0', '^0.1.0')).toBe(false);
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
