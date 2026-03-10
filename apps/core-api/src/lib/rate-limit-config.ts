// apps/core-api/src/lib/rate-limit-config.ts
//
// 3-tier env-configurable rate limit configuration for Spec 015 (T015-16).
// Reuses the existing rateLimiter() factory from middleware/rate-limiter.ts.
//
// Rate limit tiers:
//   AUTH    — 20 req/min  (default) — login, callback, refresh, logout, jwks
//   ADMIN   — 60 req/min  (default) — tenant-admin, jobs, storage uploads
//   GENERAL — 120 req/min (default) — search, notifications, storage reads
//
// All three tiers are keyed per-user (req.user?.id || req.ip) within the tenant,
// so each user gets their own bucket.
//
// Operators override defaults via environment variables:
//   RATE_LIMIT_AUTH    — integer (requests per minute for auth tier)
//   RATE_LIMIT_ADMIN   — integer (requests per minute for admin tier)
//   RATE_LIMIT_GENERAL — integer (requests per minute for general tier)
//
// Constitution Art. 9.2: DoS protection
// Spec 015 §3.3: Rate limit tiers

import type { FastifyRequest } from 'fastify';
import { type RateLimitConfig } from '../middleware/rate-limiter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an environment variable as a positive integer.
 * Falls back to the provided default if unset or invalid.
 */
function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * Key extractor: per-user within tenant.
 * Falls back to request IP for unauthenticated routes (auth endpoints).
 */
function userKey(request: FastifyRequest): string {
  const tenantId = request.tenant?.tenantId ?? request.user?.tenantSlug ?? 'unknown-tenant';
  const userId = request.user?.id ?? request.ip ?? 'anonymous';
  return `${tenantId}:${userId}`;
}

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

/**
 * AUTH tier — 20 req/min per user/IP (default).
 * Applies to: GET /auth/login, GET /auth/callback, POST /auth/refresh,
 *             POST /auth/logout, GET /auth/me, GET /auth/jwks/:slug
 *
 * Override: RATE_LIMIT_AUTH env var
 */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  scope: 'auth',
  get limit() {
    return envInt('RATE_LIMIT_AUTH', 20);
  },
  windowSeconds: 60,
  keyExtractor: userKey,
};

/**
 * ADMIN tier — 60 req/min per user within tenant (default).
 * Applies to: tenant-admin routes, job management routes, storage uploads
 *
 * Override: RATE_LIMIT_ADMIN env var
 */
export const ADMIN_RATE_LIMIT: RateLimitConfig = {
  scope: 'admin',
  get limit() {
    return envInt('RATE_LIMIT_ADMIN', 60);
  },
  windowSeconds: 60,
  keyExtractor: userKey,
};

/**
 * GENERAL tier — 120 req/min per user within tenant (default).
 * Applies to: search routes, notification routes, storage reads
 *
 * Override: RATE_LIMIT_GENERAL env var
 */
export const GENERAL_RATE_LIMIT: RateLimitConfig = {
  scope: 'general',
  get limit() {
    return envInt('RATE_LIMIT_GENERAL', 120);
  },
  windowSeconds: 60,
  keyExtractor: userKey,
};
