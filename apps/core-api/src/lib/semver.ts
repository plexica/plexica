// File: apps/core-api/src/lib/semver.ts

/**
 * Semver utilities for plugin version validation, parsing, comparison,
 * and constraint satisfaction checking.
 */

/**
 * Semver version validation regex
 * Matches: 1.0.0, 1.2.3-beta, 2.0.0-rc.1, 3.0.0-alpha+001
 */
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9\-\.]+)?(\+[a-zA-Z0-9\-\.]+)?$/;

/**
 * Validates if a string is a valid semver version
 */
export function isValidSemverVersion(version: string): boolean {
  return SEMVER_REGEX.test(version);
}

/**
 * Parses a semver version string into its components.
 * Returns null if the version is not valid semver.
 */
export function parseSemverVersion(version: string): {
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
 * Compares two semver versions.
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 * Throws if either version is invalid.
 */
export function compareSemverVersions(v1: string, v2: string): number {
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
 * Checks if a version satisfies a semver constraint.
 * Supports: ^1.0.0, ~1.2.3, >=2.0.0, >1.0.0, <=3.0.0, <4.0.0, =1.0.0, 1.0.0
 *
 * Caret (^) semantics:
 *   ^1.2.3 := >=1.2.3 <2.0.0   (left-most non-zero is major)
 *   ^0.2.3 := >=0.2.3 <0.3.0   (left-most non-zero is minor)
 *   ^0.0.3 := =0.0.3            (left-most non-zero is patch)
 *
 * Tilde (~) semantics:
 *   ~1.2.3 := >=1.2.3 <1.3.0   (patch-level changes only)
 */
export function satisfiesSemverConstraint(version: string, constraint: string): boolean {
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
    const [, cmajor, cminor, cpatch] = caretMatch.map(Number);
    if (parsed.major !== cmajor) return false;
    if (cmajor > 0) {
      // ^1.2.3 := >=1.2.3 <2.0.0 — major is locked, minor+patch must be >=
      if (parsed.minor !== cminor) return parsed.minor > cminor;
      return parsed.patch >= cpatch;
    }
    if (parsed.minor !== cminor) return false;
    if (cminor > 0) {
      // ^0.1.3 := >=0.1.3 <0.2.0 — major+minor locked, patch must be >=
      return parsed.patch >= cpatch;
    }
    // ^0.0.3 := =0.0.3
    return parsed.patch === cpatch;
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
