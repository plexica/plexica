// File: apps/core-api/src/modules/notifications/notification-stream.routes.ts
// Spec 007 T007-17: Server-Sent Events endpoint for real-time delivery
// GET /api/v1/notifications/stream
// ADR-023: SSE over WebSocket for unidirectional server→client delivery

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import Redis from 'ioredis';

// ============================================================================
// Constants
// ============================================================================

const PING_INTERVAL_MS = 30_000; // 30s keep-alive ping
const REPLAY_WINDOW_SECONDS = 300; // 5-minute replay window (per ADR-023)
const REDIS_SORTED_SET_TTL = REPLAY_WINDOW_SECONDS + 60; // slight buffer

// ============================================================================
// Helpers
// ============================================================================

function getTenantId(request: FastifyRequest): string {
  const tenantId = request.user?.tenantSlug ?? request.tenant?.tenantId;
  if (!tenantId)
    throw Object.assign(new Error('Tenant context not available'), { statusCode: 400 });
  return tenantId;
}

function getUserId(request: FastifyRequest): string {
  const userId = request.user?.id;
  if (!userId) throw Object.assign(new Error('User context not available'), { statusCode: 401 });
  return userId;
}

/** Format an SSE event frame. */
function sseEvent(event: string, data: unknown, id?: string): string {
  let frame = '';
  if (id) frame += `id: ${id}\n`;
  frame += `event: ${event}\n`;
  frame += `data: ${JSON.stringify(data)}\n\n`;
  return frame;
}

/** Redis channel for a specific user's notifications. */
function notificationChannel(tenantId: string, userId: string): string {
  return `notifications:${tenantId}:${userId}`;
}

/** Redis sorted-set key for the replay window. */
function replayKey(tenantId: string, userId: string): string {
  return `notifications:replay:${tenantId}:${userId}`;
}

// ============================================================================
// Replay: publish helper (called by NotificationService when storing inApp)
// ============================================================================

/**
 * Publish a notification event to Redis pub/sub and store it in the
 * replay sorted set (score = unix timestamp ms) for 5-minute replay.
 * Call this from NotificationService.inApp() after the DB insert.
 */
export async function publishNotificationEvent(
  tenantId: string,
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const channel = notificationChannel(tenantId, userId);
  const replaySetKey = replayKey(tenantId, userId);
  const now = Date.now();
  const eventId = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const message = JSON.stringify({ event: 'notification', data: payload, id: eventId });

  await Promise.all([
    // Publish for connected SSE clients
    redis.publish(channel, message),
    // Store in sorted set for replay on reconnect
    redis.zadd(replaySetKey, now, message),
    // Keep only last 5 minutes of events
    redis.expire(replaySetKey, REDIS_SORTED_SET_TTL),
  ]);

  logger.debug({ tenantId, userId, channel }, 'SSE: notification event published');
}

/**
 * Publish a job_status event to Redis pub/sub (multiplexed on same channel).
 * Call this from JobQueueService or job worker on status transition.
 */
export async function publishJobStatusEvent(
  tenantId: string,
  userId: string,
  jobId: string,
  status: string,
  name: string
): Promise<void> {
  const channel = notificationChannel(tenantId, userId);
  const replaySetKey = replayKey(tenantId, userId);
  const now = Date.now();
  const eventId = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const message = JSON.stringify({
    event: 'job_status',
    data: { jobId, status, name, tenantId },
    id: eventId,
  });

  await Promise.all([
    redis.publish(channel, message),
    redis.zadd(replaySetKey, now, message),
    redis.expire(replaySetKey, REDIS_SORTED_SET_TTL),
  ]);

  logger.debug({ tenantId, userId, channel, jobId, status }, 'SSE: job_status event published');
}

// ============================================================================
// Route plugin
// ============================================================================

export const notificationStreamRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', authMiddleware);

  /**
   * GET /notifications/stream
   *
   * Opens a Server-Sent Events stream for the authenticated user.
   * - Subscribes to Redis pub/sub channel `notifications:{tenantId}:{userId}`
   * - Emits `notification` and `job_status` events in real-time
   * - Replays missed events from the last 5 minutes on reconnect
   *   (uses `Last-Event-ID` header sent by the browser EventSource API)
   * - Pings every 30s to prevent proxy timeouts
   * - Unsubscribes and cleans up on client disconnect
   */
  server.get(
    '/notifications/stream',
    {
      // Disable Fastify's built-in connection timeout for this long-lived route
      config: { rateLimit: false },
      schema: {
        tags: ['notifications'],
        summary: 'SSE real-time notification stream',
        description:
          'Opens a Server-Sent Events stream. Emits notification and job_status events in real-time (ADR-023).',
        querystring: {
          type: 'object',
          properties: {
            lastEventId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);

      // ADR-023: `Last-Event-ID` header for replay on reconnect
      const lastEventId =
        (request.headers['last-event-id'] as string | undefined) ??
        (request.query as Record<string, string | undefined>)['lastEventId'];

      // --- SSE headers ---
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // disable Nginx buffering
      });

      // Create a dedicated subscriber connection (ioredis requires separate
      // connections for pub/sub and regular commands)
      const subscriber = new Redis(redis.options);
      const channel = notificationChannel(tenantId, userId);

      logger.info({ tenantId, userId, channel }, 'SSE: client connected to notification stream');

      // --- Helper: write to the raw HTTP response ---
      const write = (frame: string): boolean => {
        if (reply.raw.writableEnded) return false;
        try {
          reply.raw.write(frame);
          return true;
        } catch {
          return false;
        }
      };

      // --- Replay missed events (ADR-023 §5-minute window) ---
      if (lastEventId) {
        try {
          const lastTs = parseInt(lastEventId.split('-')[0] ?? '0', 10);
          if (!isNaN(lastTs) && lastTs > 0) {
            const cutoff = lastTs + 1; // events strictly after last seen
            const since = Date.now() - REPLAY_WINDOW_SECONDS * 1000;
            const minScore = Math.max(cutoff, since);
            const missed = await redis.zrangebyscore(replayKey(tenantId, userId), minScore, '+inf');
            for (const raw of missed) {
              try {
                const parsed = JSON.parse(raw) as {
                  event: string;
                  data: unknown;
                  id: string;
                };
                write(sseEvent(parsed.event, parsed.data, parsed.id));
              } catch {
                // skip malformed replay entry
              }
            }
            logger.debug(
              { tenantId, userId, replayed: missed.length },
              'SSE: replayed missed events'
            );
          }
        } catch (err) {
          logger.warn({ tenantId, userId, err }, 'SSE: replay failed, continuing');
        }
      }

      // --- Subscribe to Redis pub/sub channel ---
      await subscriber.subscribe(channel);

      subscriber.on('message', (_ch: string, message: string) => {
        try {
          const parsed = JSON.parse(message) as {
            event: string;
            data: unknown;
            id?: string;
          };
          write(sseEvent(parsed.event, parsed.data, parsed.id));
        } catch (err) {
          logger.warn({ tenantId, userId, err }, 'SSE: failed to parse Redis message');
        }
      });

      // --- Keep-alive ping every 30s ---
      const pingInterval = setInterval(() => {
        if (!write(sseEvent('ping', {}))) {
          clearInterval(pingInterval);
        }
      }, PING_INTERVAL_MS);

      // Send initial ping so the client knows the connection is alive
      write(sseEvent('ping', {}));

      // --- Cleanup on client disconnect ---
      const cleanup = async () => {
        clearInterval(pingInterval);
        try {
          await subscriber.unsubscribe(channel);
          subscriber.disconnect();
        } catch (err) {
          logger.warn({ tenantId, userId, err }, 'SSE: cleanup error (ignored)');
        }
        logger.info({ tenantId, userId }, 'SSE: client disconnected');
      };

      request.raw.on('close', () => {
        void cleanup();
      });

      request.raw.on('error', () => {
        void cleanup();
      });

      // Keep the Fastify handler alive — the response is never "sent" in the
      // normal sense; we write directly to reply.raw above.
      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve);
        request.raw.on('error', resolve);
      });
    }
  );
};
