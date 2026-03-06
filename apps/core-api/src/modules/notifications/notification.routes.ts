// File: apps/core-api/src/modules/notifications/notification.routes.ts
// Spec 007 T007-14: Notification REST endpoints
// POST  /api/v1/notifications          — send single notification
// POST  /api/v1/notifications/bulk     — send bulk notifications
// GET   /api/v1/notifications          — list in-app notifications for authenticated user
// PATCH /api/v1/notifications/:id/read — mark as read
// POST  /api/v1/notifications/mark-all-read — mark all as read

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requireRole } from '../../middleware/auth.js';
import { NotificationService } from './notification.service.js';
import { NotificationRepository } from './notification.repository.js';
import {
  Notification,
  NotificationSchema,
  NotificationErrorCode,
} from '../../types/core-services.types.js';
import { USER_ROLES } from '../../constants/index.js';

// ============================================================================
// Helpers
// ============================================================================

function getTenantId(request: FastifyRequest): string {
  const tenantId =
    request.tenant?.tenantId ??
    request.user?.tenantSlug ??
    (request.user as (typeof request.user & { tenantId?: string }) | undefined)?.tenantId;
  if (!tenantId)
    throw Object.assign(new Error('Tenant context not available'), { statusCode: 400 });
  return tenantId;
}

function getUserId(request: FastifyRequest): string {
  const userId = request.user?.id;
  if (!userId) throw Object.assign(new Error('User context not available'), { statusCode: 401 });
  return userId;
}

// ============================================================================
// Route plugin
// ============================================================================

export const notificationRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', authMiddleware);

  // Singleton: NotificationService initialized once per plugin registration (HIGH #4)
  const notifRepo = new NotificationRepository();
  const notifSvc = new NotificationService(notifRepo, {
    host: process.env['SMTP_HOST'] ?? '',
    port: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS'],
    from: process.env['SMTP_FROM'],
  });

  // --------------------------------------------------------------------------
  // POST /notifications — send a single notification (admin only)
  // --------------------------------------------------------------------------
  server.post(
    '/notifications',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Send a notification',
        description:
          'Send a single notification via the specified channel (EMAIL, IN_APP, PUSH). Requires admin role.',
        response: {
          201: { description: 'Notification sent', type: 'object', additionalProperties: true },
          400: {
            description: 'Validation error or invalid email address',
            type: 'object',
            additionalProperties: true,
            properties: {
              error: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
          500: {
            description: 'Failed to send notification',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
      preHandler: requireRole(
        USER_ROLES.ADMIN,
        USER_ROLES.TENANT_OWNER,
        USER_ROLES.SUPER_ADMIN,
        USER_ROLES.TENANT_ADMIN
      ),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = request.body as Record<string, unknown>;

      const parsed = NotificationSchema.safeParse({ ...body, tenantId });
      if (!parsed.success) {
        request.log.warn(
          { tenantId, userId, code: 'VALIDATION_ERROR' },
          '[NotificationRoute] invalid notification body'
        );
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid notification body',
            details: parsed.error.flatten(),
          },
        });
      }

      try {
        const result = await notifSvc.send(parsed.data);
        request.log.info(
          { tenantId, userId, channel: parsed.data.channel },
          '[NotificationRoute] notification sent'
        );
        return reply.code(201).send(result);
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        if (error.code === NotificationErrorCode.INVALID_EMAIL) {
          request.log.warn(
            { tenantId, userId, code: error.code },
            '[NotificationRoute] invalid email address'
          );
          return reply.code(400).send({ error: { code: error.code, message: error.message } });
        }
        request.log.error(
          { tenantId, userId, err: error.message },
          '[NotificationRoute] send failed'
        );
        return reply.code(500).send({
          error: {
            code: NotificationErrorCode.SEND_FAILED,
            message: 'Failed to send notification',
          },
        });
      }
    }
  );

  // --------------------------------------------------------------------------
  // POST /notifications/bulk — send bulk notifications (admin only)
  // --------------------------------------------------------------------------
  server.post(
    '/notifications/bulk',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Send bulk notifications',
        description:
          'Validate and enqueue an array of notifications for async delivery via the job queue. Requires admin role.',
        response: {
          202: {
            description: 'Notifications enqueued for delivery',
            type: 'object',
            additionalProperties: true,
            properties: {
              message: { type: 'string' },
              count: { type: 'integer' },
            },
          },
          400: { description: 'Validation error', type: 'object', additionalProperties: true },
          500: {
            description: 'Failed to enqueue notifications',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
      preHandler: requireRole(
        USER_ROLES.ADMIN,
        USER_ROLES.TENANT_OWNER,
        USER_ROLES.SUPER_ADMIN,
        USER_ROLES.TENANT_ADMIN
      ),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = request.body as unknown;

      if (!Array.isArray(body)) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body must be an array of notifications',
          },
        });
      }

      // Per-item Zod validation (HIGH #2) — validate each item before enqueuing
      const validationErrors: { index: number; errors: object }[] = [];
      const notifications: Notification[] = [];
      for (let i = 0; i < body.length; i++) {
        const parsed = NotificationSchema.safeParse({
          ...(body[i] as Record<string, unknown>),
          tenantId,
        });
        if (!parsed.success) {
          validationErrors.push({ index: i, errors: parsed.error.flatten() });
        } else {
          notifications.push(parsed.data);
        }
      }

      if (validationErrors.length > 0) {
        request.log.warn(
          { tenantId, userId, invalidCount: validationErrors.length, code: 'VALIDATION_ERROR' },
          '[NotificationRoute] bulk: invalid notification items'
        );
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: `${validationErrors.length} notification(s) failed validation`,
            details: validationErrors,
          },
        });
      }

      try {
        await notifSvc.sendBulk(notifications);
        request.log.info(
          { tenantId, userId, count: notifications.length },
          '[NotificationRoute] bulk notifications enqueued'
        );
        return reply
          .code(202)
          .send({ message: 'Bulk notifications enqueued', count: notifications.length });
      } catch (err: unknown) {
        const error = err as { message?: string };
        request.log.error(
          { tenantId, userId, err: error.message },
          '[NotificationRoute] bulk send failed'
        );
        return reply.code(500).send({
          error: {
            code: NotificationErrorCode.SEND_FAILED,
            message: 'Failed to enqueue bulk notifications',
          },
        });
      }
    }
  );

  // --------------------------------------------------------------------------
  // GET /notifications — list in-app notifications for the authenticated user
  // --------------------------------------------------------------------------
  server.get(
    '/notifications',
    {
      schema: {
        tags: ['notifications'],
        summary: 'List notifications',
        description:
          'List recent in-app notifications for the authenticated user. Supports pagination and unread filter.',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', default: 10, maximum: 100, description: 'Max results' },
            unread: { type: 'boolean', description: 'Filter to unread only' },
            offset: { type: 'integer', default: 0, description: 'Pagination offset' },
          },
        },
        response: {
          200: {
            description: 'Notification list',
            type: 'object',
            additionalProperties: true,
            properties: {
              notifications: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
              unreadCount: { type: 'integer' },
              count: { type: 'integer' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { limit?: string; unread?: string | boolean; offset?: string };
      }>,
      reply: FastifyReply
    ) => {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const query = request.query;
      const limit = Math.min(parseInt(String(query.limit ?? '10'), 10), 100);
      const offset = parseInt(String(query.offset ?? '0'), 10);
      const unreadOnly = query.unread === true || query.unread === 'true';

      const [notifications, unreadCount] = await Promise.all([
        notifRepo.listForUser(tenantId, userId, { unreadOnly, limit, offset }),
        notifRepo.getUnreadCount(tenantId, userId),
      ]);

      request.log.info(
        { tenantId, userId, count: notifications.length, unreadCount },
        '[NotificationRoute] notifications listed'
      );
      return reply.send({ notifications, unreadCount, count: notifications.length });
    }
  );

  // --------------------------------------------------------------------------
  // PATCH /notifications/:id/read — mark a notification as read
  // --------------------------------------------------------------------------
  server.patch<{ Params: { id: string } }>(
    '/notifications/:id/read',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Mark notification as read',
        description:
          'Mark a single in-app notification as read. Returns updated notification and new unread count.',
        response: {
          200: {
            description: 'Notification marked as read',
            type: 'object',
            additionalProperties: true,
            properties: {
              notification: { type: 'object', additionalProperties: true },
              unreadCount: { type: 'integer' },
            },
          },
          404: {
            description: 'Notification not found',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const { id } = request.params;

      const updated = await notifRepo.markAsRead(id, tenantId, userId);
      if (!updated) {
        request.log.warn(
          { tenantId, userId, notificationId: id },
          '[NotificationRoute] notification not found for mark-read'
        );
        return reply.code(404).send({
          error: { code: NotificationErrorCode.NOT_FOUND, message: 'Notification not found' },
        });
      }

      const unreadCount = await notifRepo.getUnreadCount(tenantId, userId);
      request.log.info(
        { tenantId, userId, notificationId: id },
        '[NotificationRoute] notification marked as read'
      );
      return reply.send({ notification: updated, unreadCount });
    }
  );

  // --------------------------------------------------------------------------
  // POST /notifications/mark-all-read — mark all as read
  // --------------------------------------------------------------------------
  server.post(
    '/notifications/mark-all-read',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Mark all notifications as read',
        description: 'Mark all in-app notifications for the authenticated user as read.',
        response: {
          200: {
            description: 'All notifications marked as read',
            type: 'object',
            additionalProperties: true,
            properties: {
              message: { type: 'string' },
              count: { type: 'integer', description: 'Number of notifications updated' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);

      const count = await notifRepo.markAllAsRead(tenantId, userId);
      request.log.info(
        { tenantId, userId, count },
        '[NotificationRoute] all notifications marked as read'
      );
      return reply.send({ message: 'All notifications marked as read', count });
    }
  );
};
