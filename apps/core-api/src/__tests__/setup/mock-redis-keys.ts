/**
 * Mock Redis Key Pattern Utilities
 *
 * Provides a correct glob-to-regex converter for mock Redis `keys()` implementations
 * in test code. Replaces naive `pattern.replace('*', '.*')` which is flagged by
 * CodeQL as `js/incomplete-multi-character-sanitization`.
 *
 * See Spec 015 T015-33, FR-034.
 */

/**
 * Convert a Redis glob pattern to a RegExp for use in mock Redis `keys()` implementations.
 *
 * Redis `KEYS` supports a simple glob syntax:
 * - `*` matches any sequence of characters (including empty)
 * - `?` matches any single character
 * - `[abc]` matches any character in the set
 *
 * This function escapes all regex-special characters in the pattern first, then
 * replaces the glob wildcards with their regex equivalents using a global replace.
 * This avoids the CodeQL `js/incomplete-multi-character-sanitization` finding that
 * arises when only the first `*` is replaced (non-global `String.replace`).
 *
 * @param pattern - A Redis glob pattern (e.g. `'rl:auth:*'`, `'session:*:data'`)
 * @returns A RegExp that matches the same keys as the Redis KEYS command would
 *
 * @example
 * globToRegex('rl:auth:*').test('rl:auth:tenant1:user1') // true
 * globToRegex('rl:auth:*').test('rl:general:tenant1')    // false
 * globToRegex('session:?:data').test('session:a:data')   // true
 */
export function globToRegex(pattern: string): RegExp {
  // Escape all regex-special characters except the glob wildcards we'll handle manually.
  // Characters to escape: . + ^ $ { } ( ) | [ ] \
  // We do NOT escape * or ? here — we handle them after.
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Convert glob wildcards to regex equivalents (global replace — catches ALL occurrences).
  const regexStr = escaped
    .replace(/\*/g, '.*') // * → .* (any sequence)
    .replace(/\?/g, '.'); // ? → .  (any single char)

  return new RegExp(`^${regexStr}$`);
}
