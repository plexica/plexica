// routes.ts
// Notification module tenant-scoped Fastify plugin (features 006-01/02/04):
// SSE stream, notification center CRUD, preferences, and the type registry.
// authMiddleware + tenantContextMiddleware + userProfileResolver run as
// scope-level preHandlers registered in src/index.ts — not re-added here.

import { rateLimitKey, SSE_CONNECT_RATE_LIMIT } from '../../lib/rate-limit-config.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { parseOrThrow } from '../../lib/validation.js';

import { connectionManager } from './connection-manager.js';
import {
  notificationListQuerySchema,
  notificationReadParamsSchema,
  notificationTypesResponseSchema,
  prefsPatchSchema,
} from './schema.js';
import {
  getPreferences,
  listNotificationCenter,
  markAllRead,
  markRead,
  updatePreferences,
} from './service.js';
import { getNotificationTypes } from './types-registry.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Long-lived SSE stream — connection establishment is rate-limited, delivery is push-only. */
async function streamHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = request.tenantContext;
  const userId = request.user.id;
  reply.hijack();
  connectionManager.connect(ctx.slug, userId, reply.raw);
}

export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/notifications/stream ── SSE (006-01, NFR-006-1)
  fastify.get(
    '/api/v1/notifications/stream',
    {
      config: {
        // Establishment only: a connection is one request; sustained frames are
        // pushed, never counted per-frame. Per-user keying (ADR-012) — the
        // scope-level authMiddleware has already populated request.user.
        // hook:'preHandler' (not the @fastify/rate-limit default onRequest)
        // ensures the check runs AFTER authMiddleware so rateLimitKey resolves
        // the user, not the IP (review M2 — 10/min/user was 10/min/IP).
        rateLimit: { ...SSE_CONNECT_RATE_LIMIT, keyGenerator: rateLimitKey, hook: 'preHandler' },
      },
    },
    streamHandler
  );

  // ── GET /api/v1/notifications ── notification center (006-02)
  fastify.get('/api/v1/notifications', {}, async (request) => {
    const query = parseOrThrow(notificationListQuerySchema, request.query);
    return withTenantDb(
      (db) => listNotificationCenter(db, request.user.id, query),
      request.tenantContext
    );
  });

  // ── PATCH /api/v1/notifications/:id/read ── mark read (006-02)
  fastify.patch('/api/v1/notifications/:id/read', {}, async (request) => {
    const { id } = parseOrThrow(notificationReadParamsSchema, request.params);
    return withTenantDb((db) => markRead(db, id, request.user.id), request.tenantContext);
  });

  // ── POST /api/v1/notifications/read-all ── plan addition (006-02)
  fastify.post('/api/v1/notifications/read-all', {}, async (request) => {
    return withTenantDb((db) => markAllRead(db, request.user.id), request.tenantContext);
  });

  // ── GET /api/v1/notifications/preferences ── prefs read (006-04)
  fastify.get('/api/v1/notifications/preferences', {}, async (request) => {
    return withTenantDb((db) => getPreferences(db, request.user.id), request.tenantContext);
  });

  // ── PATCH /api/v1/notifications/preferences ── prefs write (006-04, NFR-006-6)
  fastify.patch('/api/v1/notifications/preferences', {}, async (request) => {
    // Cast required because Zod infers optional fields as `T | undefined`, which
    // conflicts with exactOptionalPropertyTypes (same pattern as user-profile).
    const patch = parseOrThrow(prefsPatchSchema, request.body) as Parameters<
      typeof updatePreferences
    >[2];
    return withTenantDb(
      (db) => updatePreferences(db, request.user.id, patch),
      request.tenantContext
    );
  });

  // ── GET /api/v1/notifications/types ── type registry (006-04/006-05)
  fastify.get('/api/v1/notifications/types', {}, async (request) => {
    const types = await getNotificationTypes(request.tenantContext);
    // Validate the RESPONSE against the shared registry schema before sending
    // (review finding: the schema existed but was never exercised).
    return parseOrThrow(notificationTypesResponseSchema, { types });
  });
}
