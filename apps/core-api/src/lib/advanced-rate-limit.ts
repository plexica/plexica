// apps/core-api/src/lib/advanced-rate-limit.ts

import { LRUCache } from 'lru-cache';

/**
 * Advanced Rate Limiting Module
 * Implements multi-level rate limiting:
 * 1. Per-IP (global)
 * 2. Per-user (authenticated users)
 * 3. Per-endpoint (specific route limits)
 * 4. Per-tenant (multi-tenant awareness)
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastRequest: number;
}

interface RateLimitConfig {
  // Global IP-based limits
  ipLimit: number;
  ipWindow: number; // milliseconds

  // Per-user limits
  userLimit: number;
  userWindow: number;

  // Per-endpoint limits
  endpointLimit: number;
  endpointWindow: number;

  // Per-tenant limits
  tenantLimit: number;
  tenantWindow: number;
}

// Default config (can be overridden per route)
const DEFAULT_CONFIG: RateLimitConfig = {
  // 100 requests per minute per IP (less strict)
  ipLimit: 100,
  ipWindow: 60 * 1000,

  // 500 requests per hour per authenticated user
  userLimit: 500,
  userWindow: 60 * 60 * 1000,

  // 1000 requests per hour per endpoint
  endpointLimit: 1000,
  endpointWindow: 60 * 60 * 1000,

  // 5000 requests per hour per tenant
  tenantLimit: 5000,
  tenantWindow: 60 * 60 * 1000,
};

// Rate limit tracking stores with LRU eviction
const ipLimitCache = new LRUCache<string, RateLimitEntry>({
  max: 10000,
  ttl: 60 * 60 * 1000, // Keep for 1 hour
});

const userLimitCache = new LRUCache<string, RateLimitEntry>({
  max: 5000,
  ttl: 60 * 60 * 1000,
});

const endpointLimitCache = new LRUCache<string, RateLimitEntry>({
  max: 1000,
  ttl: 60 * 60 * 1000,
});

const tenantLimitCache = new LRUCache<string, RateLimitEntry>({
  max: 500,
  ttl: 60 * 60 * 1000,
});

/**
 * Check if request is rate limited
 * Returns rate limit status and remaining quota
 */
export interface RateLimitStatus {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  reason?: string;
}

/**
 * Extract client IP from request
 */
export function getClientIP(request: any): string {
  // Try X-Forwarded-For header first (behind proxy)
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',');
    return ips[0].trim();
  }

  // Try X-Real-IP header (nginx reverse proxy)
  const realIP = request.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }

  // Fall back to connection IP
  return request.ip || request.connection.remoteAddress || 'unknown';
}

/**
 * Get user ID from request
 */
export function getUserId(request: any): string | null {
  return request.user?.id || null;
}

/**
 * Get endpoint identifier (method + path)
 */
export function getEndpointId(request: any): string {
  return `${request.method}:${request.url}`;
}

/**
 * Get tenant ID from request
 */
export function getTenantId(request: any): string | null {
  return (request as any).tenant?.tenantId || null;
}

/**
 * Check IP-based rate limit
 */
export function checkIPRateLimit(
  ip: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitStatus {
  const c = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  let entry = ipLimitCache.get(ip);

  if (!entry || now > entry.resetTime) {
    // Create new entry
    entry = {
      count: 1,
      resetTime: now + c.ipWindow,
      lastRequest: now,
    };
    ipLimitCache.set(ip, entry);
    return {
      allowed: true,
      limit: c.ipLimit,
      remaining: c.ipLimit - 1,
      resetTime: entry.resetTime,
    };
  }

  // Increment counter
  entry.count++;
  entry.lastRequest = now;

  const allowed = entry.count <= c.ipLimit;
  return {
    allowed,
    limit: c.ipLimit,
    remaining: Math.max(0, c.ipLimit - entry.count),
    resetTime: entry.resetTime,
    reason: allowed ? undefined : `IP rate limit exceeded (${entry.count}/${c.ipLimit})`,
  };
}

/**
 * Check user-based rate limit
 */
export function checkUserRateLimit(
  userId: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitStatus {
  const c = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  let entry = userLimitCache.get(userId);

  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + c.userWindow,
      lastRequest: now,
    };
    userLimitCache.set(userId, entry);
    return {
      allowed: true,
      limit: c.userLimit,
      remaining: c.userLimit - 1,
      resetTime: entry.resetTime,
    };
  }

  entry.count++;
  entry.lastRequest = now;

  const allowed = entry.count <= c.userLimit;
  return {
    allowed,
    limit: c.userLimit,
    remaining: Math.max(0, c.userLimit - entry.count),
    resetTime: entry.resetTime,
    reason: allowed ? undefined : `User rate limit exceeded (${entry.count}/${c.userLimit})`,
  };
}

/**
 * Check endpoint-based rate limit
 */
export function checkEndpointRateLimit(
  endpointId: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitStatus {
  const c = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  let entry = endpointLimitCache.get(endpointId);

  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + c.endpointWindow,
      lastRequest: now,
    };
    endpointLimitCache.set(endpointId, entry);
    return {
      allowed: true,
      limit: c.endpointLimit,
      remaining: c.endpointLimit - 1,
      resetTime: entry.resetTime,
    };
  }

  entry.count++;
  entry.lastRequest = now;

  const allowed = entry.count <= c.endpointLimit;
  return {
    allowed,
    limit: c.endpointLimit,
    remaining: Math.max(0, c.endpointLimit - entry.count),
    resetTime: entry.resetTime,
    reason: allowed
      ? undefined
      : `Endpoint rate limit exceeded (${entry.count}/${c.endpointLimit})`,
  };
}

/**
 * Check tenant-based rate limit
 */
export function checkTenantRateLimit(
  tenantId: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitStatus {
  const c = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  let entry = tenantLimitCache.get(tenantId);

  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + c.tenantWindow,
      lastRequest: now,
    };
    tenantLimitCache.set(tenantId, entry);
    return {
      allowed: true,
      limit: c.tenantLimit,
      remaining: c.tenantLimit - 1,
      resetTime: entry.resetTime,
    };
  }

  entry.count++;
  entry.lastRequest = now;

  const allowed = entry.count <= c.tenantLimit;
  return {
    allowed,
    limit: c.tenantLimit,
    remaining: Math.max(0, c.tenantLimit - entry.count),
    resetTime: entry.resetTime,
    reason: allowed ? undefined : `Tenant rate limit exceeded (${entry.count}/${c.tenantLimit})`,
  };
}

/**
 * Perform comprehensive rate limit check
 * Checks all applicable limits and returns first failure
 */
export function checkAllRateLimits(
  request: any,
  config: Partial<RateLimitConfig> = {}
): RateLimitStatus {
  // Check IP limit first (always applies)
  const ip = getClientIP(request);
  const ipStatus = checkIPRateLimit(ip, config);
  if (!ipStatus.allowed) {
    return ipStatus;
  }

  // Check user limit if authenticated
  const userId = getUserId(request);
  if (userId) {
    const userStatus = checkUserRateLimit(userId, config);
    if (!userStatus.allowed) {
      return userStatus;
    }
  }

  // Check endpoint limit
  const endpointId = getEndpointId(request);
  const endpointStatus = checkEndpointRateLimit(endpointId, config);
  if (!endpointStatus.allowed) {
    return endpointStatus;
  }

  // Check tenant limit if available
  const tenantId = getTenantId(request);
  if (tenantId) {
    const tenantStatus = checkTenantRateLimit(tenantId, config);
    if (!tenantStatus.allowed) {
      return tenantStatus;
    }
  }

  // All checks passed
  return {
    allowed: true,
    limit: 0,
    remaining: 0,
    resetTime: Date.now(),
  };
}

/**
 * Reset all rate limit caches
 * Useful for testing to ensure clean state between tests
 */
export function resetAllCaches(): void {
  ipLimitCache.clear();
  userLimitCache.clear();
  endpointLimitCache.clear();
  tenantLimitCache.clear();
  // NOTE: User sync cache removed in Spec 002 Phase 5 (async sync via UserSyncConsumer)
}

/**
 * Get rate limit statistics for monitoring
 */
export function getRateLimitStats() {
  return {
    ipLimitEntries: ipLimitCache.size,
    userLimitEntries: userLimitCache.size,
    endpointLimitEntries: endpointLimitCache.size,
    tenantLimitEntries: tenantLimitCache.size,
    totalEntries:
      ipLimitCache.size + userLimitCache.size + endpointLimitCache.size + tenantLimitCache.size,
    estimatedMemory: `~${Math.round((ipLimitCache.size * 256) / 1024)}KB`,
  };
}
