// middleware/dev-route-auth.ts
// Dev-mode route authentication for plugin dev registration endpoints.
//
// These routes were originally mounted inside the tenantScope, where
// authMiddleware requires a user JWT. registerBackend() from @plexica/sdk/dev
// has no JWT, so every registration attempt returned 401 — the dev loop of a
// freshly scaffolded plugin could never register. The CRM example worked only
// because the core probes its backend core-side (modules/plugin/index.ts).
//
// This middleware replicates the pluginEventAuth pattern (routes outside the
// authenticated tenantScope, dedicated auth): dev registration is gated by
// NODE_ENV=development AND loopback-only, so no user identity is required.
// The tenant slug is taken from the X-Tenant-Slug header (already honored in
// non-production by tenantContextMiddleware, H-3) and validated before use.

import {
  InvalidTenantContextError,
  TenantPendingDeletionError,
  TenantSuspendedError,
} from '../lib/app-error.js';
import { TENANT_SLUG_REGEX } from '../lib/slug.js';
import { enterWithTenant } from '../lib/tenant-context-store.js';

import { resolveTenant } from './tenant-context.js';

import type { FastifyReply, FastifyRequest } from 'fastify';

export async function devRouteAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Fail-closed dev gate: dev registration is only available when NODE_ENV is
  // EXPLICITLY set to development. config.NODE_ENV defaults to 'development'
  // when the variable is unset (for the local DX), so relying on it would
  // leave the routes active in a deployment that forgot the variable. Reading
  // process.env with a 'production' default closes that gap: unset → 404.
  const effectiveEnv = process.env['NODE_ENV'] ?? 'production';
  if (effectiveEnv !== 'development') {
    return reply.status(404).send({ error: 'Not found' });
  }

  // And only from the machine running the core (localhost).
  const remoteAddr = request.socket.remoteAddress;
  const isLoopback =
    remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
  if (!isLoopback) {
    return reply.status(403).send({ error: 'Dev registration is only available from localhost' });
  }

  // Dev plugins declare their tenant explicitly (non-production header, H-3).
  const headerSlug = request.headers['x-tenant-slug'];
  if (typeof headerSlug !== 'string' || !TENANT_SLUG_REGEX.test(headerSlug)) {
    throw new InvalidTenantContextError();
  }

  const resolved = await resolveTenant(headerSlug);
  // ID-002: unknown or deleted tenant → same generic 400 as the tenant path.
  if (resolved === null) {
    throw new InvalidTenantContextError();
  }
  // ADR-022 Decision 1: mirror the tenant path — suspended / pending_deletion
  // tenants get 403, not the generic 400 (unknown stays 400, anti-enumeration).
  if (resolved.status === 'suspended') {
    throw new TenantSuspendedError();
  }
  if (resolved.status === 'pending_deletion') {
    throw new TenantPendingDeletionError();
  }
  if (resolved.context === null) {
    throw new InvalidTenantContextError();
  }

  enterWithTenant(resolved.context);
  request.tenantContext = resolved.context;
}