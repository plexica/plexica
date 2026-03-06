// File: apps/core-api/src/modules/notifications/notification.repository.ts
// Spec 007 T007-07: Prisma-based repository for Notification persistence
// Methods: create, markAsRead, markAllAsRead, listForUser, getUnreadCount

import { db } from '../../lib/db.js';
import { Prisma } from '@plexica/database';
import { NotificationChannel, NotificationStatus } from '../../types/core-services.types.js';

// ============================================================================
// Types
// ============================================================================

export interface CreateNotificationInput {
  tenantId: string;
  userId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface DbNotification {
  id: string;
  tenantId: string;
  userId: string;
  channel: string;
  status: string;
  title: string;
  body: string;
  metadata: unknown | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListNotificationsFilter {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================================================
// NotificationRepository
// ============================================================================

export class NotificationRepository {
  // --------------------------------------------------------------------------
  // Create
  // --------------------------------------------------------------------------

  async create(input: CreateNotificationInput): Promise<DbNotification> {
    const notif = await db.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        channel: input.channel,
        status: input.status,
        title: input.title,
        body: input.body,
        metadata:
          input.metadata !== undefined
            ? (input.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
    return notif as DbNotification;
  }

  // --------------------------------------------------------------------------
  // Mark a single notification as read
  // --------------------------------------------------------------------------

  async markAsRead(id: string, tenantId: string, userId: string): Promise<DbNotification | null> {
    // First verify ownership (tenant + user isolation)
    const existing = await db.notification.findFirst({
      where: { id, tenantId, userId },
    });
    if (!existing) return null;

    const notif = await db.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
    return notif as DbNotification;
  }

  // --------------------------------------------------------------------------
  // Mark all notifications as read for a user in a tenant
  // --------------------------------------------------------------------------

  async markAllAsRead(tenantId: string, userId: string): Promise<number> {
    const result = await db.notification.updateMany({
      where: {
        tenantId,
        userId,
        status: { not: NotificationStatus.READ },
        channel: NotificationChannel.IN_APP,
      },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
    return result.count as number;
  }

  // --------------------------------------------------------------------------
  // List notifications for a user (tenant-scoped, in-app only for UI)
  // --------------------------------------------------------------------------

  async listForUser(
    tenantId: string,
    userId: string,
    filter: ListNotificationsFilter = {}
  ): Promise<DbNotification[]> {
    const { unreadOnly = false, limit = 10, offset = 0 } = filter;

    const where: Record<string, unknown> = {
      tenantId,
      userId,
      channel: NotificationChannel.IN_APP,
    };

    if (unreadOnly) {
      where['status'] = { not: NotificationStatus.READ };
    }

    const notifications = await db.notification.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return notifications as DbNotification[];
  }

  // --------------------------------------------------------------------------
  // Get unread count for a user in a tenant
  // --------------------------------------------------------------------------

  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    const count = await db.notification.count({
      where: {
        tenantId,
        userId,
        channel: NotificationChannel.IN_APP,
        status: { not: NotificationStatus.READ },
      },
    });
    return count as number;
  }

  // --------------------------------------------------------------------------
  // Update status (for email/push delivery tracking)
  // --------------------------------------------------------------------------

  async updateStatus(id: string, status: NotificationStatus): Promise<void> {
    await db.notification.update({
      where: { id },
      data: { status },
    });
  }
}
