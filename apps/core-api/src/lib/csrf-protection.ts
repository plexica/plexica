// apps/core-api/src/lib/csrf-protection.ts

import * as crypto from 'crypto';
import { LRUCache } from 'lru-cache';

/**
 * CSRF Protection Module
 * Implements double-submit cookie pattern with token verification
 *
 * Strategy:
 * 1. Generate unique token per session
 * 2. Store token in server-side cache (fast validation)
 * 3. Client must send token in X-CSRF-Token header
 * 4. Validate token on POST, PUT, DELETE, PATCH operations
 */

interface CSRFTokenEntry {
  token: string;
  created: number;
  sessionId: string;
  userAgent?: string;
}

// In-memory token storage with LRU eviction
// Limits to 10000 tokens (assuming ~100KB memory)
const tokenCache = new LRUCache<string, CSRFTokenEntry>({
  max: 10000,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

/**
 * Generate a new CSRF token for a session
 * Tokens are cryptographically random 32-byte values
 */
export function generateCSRFToken(sessionId: string, userAgent?: string): string {
  const token = crypto.randomBytes(32).toString('hex');

  const entry: CSRFTokenEntry = {
    token,
    created: Date.now(),
    sessionId,
    userAgent,
  };

  // Store in cache
  tokenCache.set(token, entry);

  return token;
}

/**
 * Validate a CSRF token
 * Returns true if token is valid and not expired
 */
export function validateCSRFToken(token: string, sessionId: string, userAgent?: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const entry = tokenCache.get(token);

  if (!entry) {
    return false;
  }

  // Verify session ID matches
  if (entry.sessionId !== sessionId) {
    return false;
  }

  // Optionally verify user agent (helps prevent token theft)
  if (userAgent && entry.userAgent && entry.userAgent !== userAgent) {
    return false;
  }

  // Token is valid - remove it to prevent reuse
  tokenCache.delete(token);

  return true;
}

/**
 * Revoke all tokens for a session (on logout)
 */
export function revokeSessionTokens(sessionId: string): void {
  let _revoked = 0;

  for (const [token, entry] of tokenCache.entries()) {
    if (entry.sessionId === sessionId) {
      tokenCache.delete(token);
      _revoked++;
    }
  }
  // Silently revoke - no need to log
}

/**
 * Extract session ID from various sources
 */
export function getSessionId(request: any): string {
  // Method 1: From JWT token (sub claim)
  if (request.user?.id) {
    return request.user.id;
  }

  // Method 2: From session cookie
  if (request.cookies?.sessionId) {
    return request.cookies.sessionId;
  }

  // Method 3: Generate temporary session ID from IP + User-Agent
  const ip = request.ip || request.connection.remoteAddress || 'unknown';
  const userAgent = request.headers['user-agent'] || 'unknown';
  return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex');
}

/**
 * Extract user agent from request
 */
export function getUserAgent(request: any): string | undefined {
  return request.headers['user-agent'];
}

/**
 * Check if request should be CSRF protected
 * CSRF protection applies to state-changing methods
 */
export function shouldCheckCSRF(method: string): boolean {
  const protectedMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  return protectedMethods.includes(method.toUpperCase());
}

/**
 * Extract CSRF token from request
 * Looks in: X-CSRF-Token header, CSRF-Token cookie
 */
export function extractCSRFToken(request: any): string | null {
  // Method 1: X-CSRF-Token header (preferred)
  const headerToken = request.headers['x-csrf-token'];
  if (headerToken && typeof headerToken === 'string') {
    return headerToken.trim();
  }

  // Method 2: X-CSRF-TOKEN header (case variation)
  const headerToken2 = request.headers['x-csrf-token'];
  if (headerToken2 && typeof headerToken2 === 'string') {
    return headerToken2.trim();
  }

  // Method 3: CSRF-Token cookie
  if (request.cookies?.['csrf-token']) {
    return request.cookies['csrf-token'];
  }

  return null;
}

/**
 * Get list of routes that should skip CSRF protection
 * These are typically safe routes (GET, HEAD, OPTIONS) or special endpoints
 */
export function getCSRFExemptRoutes(): string[] {
  return [
    '/health',
    '/docs',
    '/api/auth/login', // CORS preflight may be POST
    '/api/auth/refresh', // Token refresh uses refresh_token in body, not Bearer header
    '/api/auth/logout', // Logout uses refresh_token in body, not Bearer header
    '/api/tenants/register', // Initial tenant registration
  ];
}

/**
 * Check if a route should be exempted from CSRF protection
 */
export function isCSRFExempt(url: string, method: string): boolean {
  // Safe methods never need CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true;
  }

  // Check exempt routes
  const exemptRoutes = getCSRFExemptRoutes();
  return exemptRoutes.some((route) => url.startsWith(route));
}

/**
 * Get CSRF statistics for monitoring
 */
export function getCSRFStats() {
  return {
    activeTokens: tokenCache.size,
    maxTokens: tokenCache.max,
    memoryUsage: `~${Math.round((tokenCache.size * 256) / 1024)}KB`,
  };
}
