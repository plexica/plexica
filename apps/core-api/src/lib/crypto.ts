/**
 * Crypto utilities for secure hashing and ETag generation
 *
 * @module lib/crypto
 */

import { createHmac, randomBytes } from 'crypto';

// ETAG_SECRET must be set in production for secure cache validation
// In development, we generate a random secret on startup (acceptable for local testing)
const ETAG_SECRET = process.env.ETAG_SECRET || generateDevSecret();

function generateDevSecret(): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ETAG_SECRET environment variable must be set in production. ' +
        'Generate a secure secret with: openssl rand -hex 32'
    );
  }

  // Development only: generate random secret on startup
  const secret = randomBytes(32).toString('hex');
  console.warn(
    '[DEV] ETAG_SECRET not set, using ephemeral secret. ' +
      'Set ETAG_SECRET in .env for consistent cache validation across restarts.'
  );
  return secret;
}

/**
 * Generate a secure HMAC-based ETag from content
 *
 * Uses HMAC-SHA256 with a secret key to prevent cache poisoning attacks.
 * Attackers cannot forge ETags without knowing the secret.
 *
 * @param content - Content to generate ETag for (typically a content hash)
 * @returns Secure ETag string (16-character hex)
 *
 * @example
 * const etag = generateSecureETag('abc123...'); // "8f7a3b9c..."
 */
export function generateSecureETag(content: string): string {
  return createHmac('sha256', ETAG_SECRET).update(content).digest('hex').substring(0, 16);
}

/**
 * Validate an ETag against content
 *
 * @param etag - ETag value from client (without quotes)
 * @param content - Content to validate against
 * @returns True if ETag is valid for the content
 *
 * @example
 * const isValid = validateETag(clientETag, contentHash); // true/false
 */
export function validateETag(etag: string, content: string): boolean {
  const expectedETag = generateSecureETag(content);
  return etag === expectedETag;
}
