// crypto.ts
// Secure token generation utilities.

import { randomBytes } from 'node:crypto';

/**
 * Generates a URL-safe base64 token with 32 bytes of entropy (~43 characters).
 * Suitable for invitation tokens, password reset links, etc.
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}
