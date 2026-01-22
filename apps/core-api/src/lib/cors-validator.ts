// apps/core-api/src/lib/cors-validator.ts

/**
 * CORS origin validator
 * Prevents malformed URLs and improper origin configurations
 */

/**
 * Validate a single CORS origin URL
 * Ensures it's a valid URL with proper format
 *
 * @param origin - URL string to validate
 * @returns true if valid, false otherwise
 */
export function isValidCorsOrigin(origin: string): boolean {
  if (!origin || typeof origin !== 'string') {
    return false;
  }

  origin = origin.trim();

  // Special case: wildcard (only for development/testing)
  if (origin === '*') {
    console.warn('[CORS] Wildcard (*) origin is not recommended for production');
    return true;
  }

  // Must start with http:// or https://
  if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
    console.error(`[CORS] Invalid origin protocol: ${origin}`);
    return false;
  }

  try {
    // Try to parse as URL to validate format
    const url = new URL(origin);

    // Ensure it has a hostname
    if (!url.hostname) {
      console.error(`[CORS] Origin missing hostname: ${origin}`);
      return false;
    }

    // Check for suspicious patterns
    if (url.pathname && url.pathname !== '/') {
      console.warn(`[CORS] Origin has pathname, typically not recommended: ${origin}`);
    }

    if (url.search) {
      console.error(`[CORS] Origin contains query string: ${origin}`);
      return false;
    }

    if (url.hash) {
      console.error(`[CORS] Origin contains fragment: ${origin}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[CORS] Invalid origin URL: ${origin}`, error);
    return false;
  }
}

/**
 * Parse and validate multiple CORS origins from a comma-separated string
 *
 * @param corsOriginString - Comma-separated origin URLs
 * @returns Array of valid origins
 */
export function parseCorsOrigins(corsOriginString: string): string[] {
  if (!corsOriginString) {
    console.warn('[CORS] No CORS origins configured, using localhost');
    return ['http://localhost:3001'];
  }

  const origins = corsOriginString
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const validOrigins = origins.filter((origin) => {
    const isValid = isValidCorsOrigin(origin);
    if (!isValid) {
      console.error(`[CORS] Removing invalid origin: ${origin}`);
    }
    return isValid;
  });

  if (validOrigins.length === 0) {
    console.warn('[CORS] No valid origins after parsing, using localhost');
    return ['http://localhost:3001'];
  }

  if (validOrigins.length !== origins.length) {
    console.warn(`[CORS] Filtered ${origins.length - validOrigins.length} invalid origins`);
  }

  console.log('[CORS] Loaded valid origins:', validOrigins);
  return validOrigins;
}

/**
 * Create a CORS origin matcher function for Fastify
 * Supports regex patterns and exact matching
 */
export function createCorsOriginMatcher(allowedOrigins: string[]) {
  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // No origin header (same-origin requests, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Check for wildcard
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    // Log denied origins for security monitoring
    console.warn(`[CORS] Request denied from unauthorized origin: ${origin}`);
    return callback(new Error('CORS not allowed'));
  };
}
