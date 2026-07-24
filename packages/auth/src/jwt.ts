// jwt.ts
// Pure JWT utilities shared across Plexica apps.
// No runtime dependencies — safe to import anywhere.

import type { BaseUserProfile } from './types.js';

/**
 * Decode a base64url-encoded JWT payload segment.
 * Handles:
 *   - base64url charset (- instead of +, _ instead of /)
 *   - UTF-8 encoded characters (e.g. non-ASCII names)
 * atob() alone handles neither.
 */
export function decodeBase64Url(input: string): unknown {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // JWT segments are unpadded; atob() requires padding to length % 4 === 0.
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binaryStr = atob(padded);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Decode the payload of a JWT access token.
 * Returns the raw payload record — caller extracts specific claims.
 */
export function decodeAccessToken<T extends Record<string, unknown>>(accessToken: string): T {
  const parts = accessToken.split('.');
  if (parts.length !== 3 || parts[1] === undefined) {
    throw new Error('Malformed JWT access token');
  }
  return decodeBase64Url(parts[1]) as T;
}

/**
 * Extract the base user profile fields common to all Plexica access tokens.
 * Callers extend with realm-specific fields.
 */
export function extractBaseProfile(accessToken: string): BaseUserProfile {
  const payload = decodeAccessToken<Record<string, unknown>>(accessToken);
  return {
    id: String(payload['sub'] ?? ''),
    email: String(payload['email'] ?? ''),
    firstName: String(payload['given_name'] ?? ''),
    lastName: String(payload['family_name'] ?? ''),
    roles: (payload['realm_access'] as { roles?: string[] } | undefined)?.roles ?? [],
  };
}

/**
 * Extract the JWT expiry timestamp from an access token.
 * Returns 0 if the token is malformed or has no exp claim.
 */
export function getTokenExpiry(accessToken: string): number {
  try {
    const payload = decodeAccessToken<Record<string, unknown>>(accessToken);
    return typeof payload['exp'] === 'number' ? payload['exp'] : 0;
  } catch {
    return 0;
  }
}

/**
 * Check whether an access token is still valid (not expired).
 * Uses the JWT exp claim compared against the current time.
 */
export function isTokenValid(accessToken: string): boolean {
  const exp = getTokenExpiry(accessToken);
  return exp > Date.now() / 1000;
}
