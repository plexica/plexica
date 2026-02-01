// apps/core-api/src/middleware/csrf-protection.ts

import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  shouldCheckCSRF,
  isCSRFExempt,
  extractCSRFToken,
  validateCSRFToken,
  getSessionId,
  getUserAgent,
} from '../lib/csrf-protection.js';

/**
 * CSRF Protection Middleware
 * Validates CSRF tokens on state-changing operations (POST, PUT, DELETE, PATCH)
 *
 * Exemptions:
 * - GET, HEAD, OPTIONS requests (safe methods)
 * - Health check and docs endpoints
 * - Initial authentication routes
 * - Requests with Bearer tokens (API clients using JWT authentication)
 */
export async function csrfProtectionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check if this request needs CSRF protection
    if (!shouldCheckCSRF(request.method)) {
      return; // Safe method, no CSRF check needed
    }

    // Check if this route is exempted from CSRF protection
    if (isCSRFExempt(request.url, request.method)) {
      return; // Exempt route
    }

    // Skip CSRF check for Bearer token authentication
    // Bearer tokens are not vulnerable to CSRF as they're not automatically sent by browsers
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return; // Using Bearer authentication, CSRF protection not needed
    }

    // Extract and validate CSRF token
    const token = extractCSRFToken(request);

    if (!token) {
      request.log.warn(`[CSRF] Missing token for ${request.method} ${request.url}`);
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'CSRF token missing',
        details: 'Include X-CSRF-Token header with valid token for state-changing operations',
      });
    }

    // Get session ID and user agent for validation
    const sessionId = getSessionId(request);
    const userAgent = getUserAgent(request);

    // Validate CSRF token
    const isValid = validateCSRFToken(token, sessionId, userAgent);

    if (!isValid) {
      request.log.warn(`[CSRF] Invalid token for ${request.method} ${request.url}`);
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Invalid CSRF token',
        details: 'The CSRF token is invalid, expired, or has already been used',
      });
    }

    // Token is valid, proceed
    request.log.debug(`[CSRF] Token validated for ${request.method} ${request.url}`);
  } catch (error) {
    request.log.error(error, 'Error in CSRF protection middleware');
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'CSRF validation failed',
    });
  }
}
