// services/service-token.ts
// Plugin service-account token — lets plugin backends authenticate to the
// core event-emission endpoint WITHOUT a user JWT. Plugin backends receive
// only DATABASE_URL + CORE_API_URL env vars (no user session), so a user-JWT
// ABAC gate on /api/v1/events/emit made event emission impossible (AC-05
// broken end-to-end).
//
// Design: stateless HMAC-SHA256. Token = `${installId}.${tenantSlug}.${hmac}`.
// The HMAC covers `${installId}:${tenantSlug}` so neither field can be
// tampered independently. The events route verifies the HMAC, resolves the
// tenant context from tenantSlug (so withTenantDb works without a JWT realm),
// and confirms the installation's plugin slug matches the event namespace.
//
// The secret is the PLUGIN_SERVICE_TOKEN_SECRET env var.

import crypto from 'node:crypto';

import { logger } from '../../../lib/logger.js';

const SECRET = process.env['PLUGIN_SERVICE_TOKEN_SECRET'] ?? '';

if (!SECRET) {
  logger.warn(
    'PLUGIN_SERVICE_TOKEN_SECRET is not set — plugin service tokens will use an insecure dev default. Set this in production.',
  );
}

function secretKey(): string {
  return SECRET || 'plexica-dev-insecure-service-token-secret';
}

export interface ServiceTokenPayload {
  installId: string;
  tenantSlug: string;
}

/** Generates a service token for the given installation + tenant. */
export function generateServiceToken(installId: string, tenantSlug: string): string {
  const mac = crypto.createHmac('sha256', secretKey()).update(`${installId}:${tenantSlug}`).digest('hex');
  return `${installId}.${tenantSlug}.${mac}`;
}

/**
 * Verifies a service token. Returns the payload if valid, otherwise null.
 * Constant-time comparison; length-checked before timingSafeEqual to avoid
 * RangeError on attacker-controlled wrong-length input.
 */
export function verifyServiceToken(token: string): ServiceTokenPayload | null {
  const parts = token.split('.');
  // Expect exactly 3 parts: installId.tenantSlug.mac
  // (tenantSlug itself has no dots — it matches /^[a-z][a-z0-9-]{1,62}$/)
  if (parts.length !== 3) return null;
  const [installId, tenantSlug, providedMac] = parts as [string, string, string];
  if (!installId || !tenantSlug || !providedMac) return null;
  const expectedMac = crypto.createHmac('sha256', secretKey()).update(`${installId}:${tenantSlug}`).digest('hex');
  if (providedMac.length !== expectedMac.length) return null;
  const valid = crypto.timingSafeEqual(Buffer.from(providedMac), Buffer.from(expectedMac));
  return valid ? { installId, tenantSlug } : null;
}
