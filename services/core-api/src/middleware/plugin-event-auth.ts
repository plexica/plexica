// middleware/plugin-event-auth.ts
// Dual-path authentication for the plugin event-emission endpoint.
//
// Plugin backends authenticate with an X-Plugin-Service-Token (HMAC, no user
// JWT) — they have no user session. User-initiated emissions still use a
// standard Authorization: Bearer JWT. This middleware detects which path
// applies and either:
//   1. service-token → verify token, resolve tenant context from the embedded
//      tenantSlug, stamp request.tenantContext + enterWithTenant so withTenantDb
//      works downstream. request.user is left unset (the handler's service-token
//      branch does not touch request.user).
//   2. user JWT → delegate to authMiddleware + tenantContextMiddleware so the
//      handler's ABAC branch has a populated request.user + request.tenantContext.
//
// This MUST be registered in a scope that does NOT already apply authMiddleware
// or tenantContextMiddleware (otherwise service-token requests are rejected 401
// before reaching this handler).

import { verifyServiceToken } from '../modules/plugin/services/service-token.js';
import { ForbiddenError, UnauthorizedError } from '../lib/app-error.js';
import { enterWithTenant } from '../lib/tenant-context-store.js';

import { tenantContextMiddleware, resolveTenant } from './tenant-context.js';
import { authMiddleware } from './auth-middleware.js';

import type { FastifyRequest, FastifyReply } from 'fastify';

export async function pluginEventAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const serviceToken = request.headers['x-plugin-service-token'];
  const authHeader = request.headers.authorization;

  if (typeof serviceToken === 'string' && serviceToken.length > 0) {
    const payload = verifyServiceToken(serviceToken);
    if (!payload) {
      throw new ForbiddenError('Invalid plugin service token');
    }
    const resolved = await resolveTenant(payload.tenantSlug);
    // ADR-022 Decision 1: only active tenants may emit events. suspended /
    // pending_deletion / deleted / unknown are all rejected uniformly here
    // (service-token holders are not end-users, so a generic 403 is fine).
    if (resolved?.status !== 'active') {
      throw new ForbiddenError(`Unknown or inactive tenant "${payload.tenantSlug}" in service token`);
    }
    request.tenantContext = resolved.context;
    enterWithTenant(resolved.context);
    return;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing valid Authorization header or X-Plugin-Service-Token');
  }
  await authMiddleware(request, reply);
  await tenantContextMiddleware(request, reply);
}
