/**
 * Content hashing utilities for cache-busting URLs.
 *
 * Generates deterministic SHA-256 hashes from translation content.
 */

import { createHash } from 'node:crypto';

/**
 * Generate deterministic 8-character content hash from translation messages.
 *
 * Uses SHA-256 hash truncated to 8 hex characters for cache-busting URLs.
 * Ensures that translation bundles are immutable once hashed.
 *
 * @param messages - Flat translation messages object
 * @returns 8-character hex hash (e.g., "a1b2c3d4")
 *
 * @example
 * ```typescript
 * const messages = {
 *   'dashboard.title': 'Dashboard',
 *   'dashboard.welcome': 'Welcome, {name}!'
 * };
 *
 * const hash = generateContentHash(messages);
 * // Result: "a1b2c3d4" (deterministic)
 *
 * // Use in CDN URL:
 * // /translations/en/dashboard.a1b2c3d4.json
 * ```
 */
export function generateContentHash(messages: Record<string, string>): string {
  // Sort keys for deterministic hashing
  const sortedKeys = Object.keys(messages).sort();

  // Create canonical JSON representation
  const canonical = sortedKeys.map((key) => `${key}:${messages[key]}`).join('\n');

  // Generate SHA-256 hash
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');

  // Return first 8 characters (32 bits)
  // Collision probability: ~1 in 4 billion for random inputs
  return hash.substring(0, 8);
}
