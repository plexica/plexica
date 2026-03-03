// File: apps/core-api/src/modules/notifications/notification.service.ts
// Spec 007 T007-07: NotificationService — email + in-app + push (stub)
// FR-004: send notifications, FR-005: bulk async, FR-006: template rendering
// NFR-005: email delivery <5s P95

import nodemailer from 'nodemailer';
import { logger } from '../../lib/logger.js';
import {
  INotificationService,
  Notification,
  NotificationChannel,
  NotificationStatus,
  NotificationErrorCode,
  EmailMessage,
  PushMessage,
  InAppMessage,
  BulkNotificationOptions,
} from '../../types/core-services.types.js';
import { NotificationRepository } from './notification.repository.js';
import { renderTemplate } from './notification-template.js';

// ============================================================================
// SMTP config
// ============================================================================

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from?: string;
}

// ============================================================================
// Retry helper
// ============================================================================

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 200): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError;
}

// ============================================================================
// Email address validation
// ============================================================================

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================================
// NotificationService
// ============================================================================

export class NotificationService implements INotificationService {
  private readonly repository: NotificationRepository;
  private readonly smtp: SmtpConfig | null;
  private transporter: nodemailer.Transporter | null = null;
  /** Optional: reference to JobQueueService for sendBulk — injected post-construction */
  private jobQueueService: {
    enqueue: (job: any, opts?: any) => Promise<{ jobId: string }>;
  } | null = null;

  constructor(repository: NotificationRepository, smtp: SmtpConfig | null) {
    this.repository = repository;
    this.smtp = smtp;

    if (smtp?.host) {
      this.transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
        secure: smtp.port === 465,
      });
    }
  }

  /** Inject JobQueueService after construction to avoid circular dependency */
  setJobQueueService(svc: { enqueue: (job: any, opts?: any) => Promise<{ jobId: string }> }): void {
    this.jobQueueService = svc;
  }

  // --------------------------------------------------------------------------
  // Send a single notification (routes by channel)
  // --------------------------------------------------------------------------

  async send(notification: Notification): Promise<Notification> {
    switch (notification.channel) {
      case NotificationChannel.EMAIL:
        await this.email(notification.tenantId, {
          to: (notification as any).to ?? '',
          subject: (notification as any).subject ?? notification.title,
          body: notification.body,
          htmlBody: (notification as any).htmlBody,
        });
        break;
      case NotificationChannel.PUSH:
        await this.push(notification.tenantId, {
          userId: notification.userId,
          title: notification.title,
          body: notification.body,
        });
        break;
      case NotificationChannel.IN_APP:
        return this.inApp(notification.tenantId, {
          userId: notification.userId,
          title: notification.title,
          body: notification.body,
          metadata: notification.metadata,
        });
      default:
        throw Object.assign(
          new Error(`Unknown notification channel: ${(notification as any).channel}`),
          { code: NotificationErrorCode.SEND_FAILED, statusCode: 400 }
        );
    }
    return notification;
  }

  // --------------------------------------------------------------------------
  // Bulk send — enqueue each as a job for async delivery (FR-005)
  // --------------------------------------------------------------------------

  async sendBulk(notifications: Notification[], _options?: BulkNotificationOptions): Promise<void> {
    if (!this.jobQueueService) {
      // Fallback: send synchronously if no job queue available
      await Promise.allSettled(notifications.map((n) => this.send(n)));
      return;
    }

    await Promise.all(
      notifications.map((notif) =>
        this.jobQueueService!.enqueue({
          tenantId: notif.tenantId,
          name: 'notifications.send',
          payload: { notification: notif, tenantId: notif.tenantId },
        })
      )
    );

    logger.info(
      { count: notifications.length },
      '[NotificationService] bulk notifications enqueued'
    );
  }

  // --------------------------------------------------------------------------
  // Email channel
  // --------------------------------------------------------------------------

  async email(tenantId: string, message: EmailMessage): Promise<void> {
    // Edge Case #3: invalid email → mark as FAILED immediately, no retry
    // Note: do NOT include the email address in the error message (PII)
    if (!isValidEmail(message.to)) {
      throw Object.assign(new Error('Invalid email address supplied'), {
        code: NotificationErrorCode.INVALID_EMAIL,
        statusCode: 400,
      });
    }

    if (!this.transporter) {
      logger.warn({ tenantId }, '[NotificationService] SMTP not configured — skipping email');
      return;
    }

    const subject = renderTemplate(message.subject, {});
    const body = renderTemplate(message.body, {});

    // Persist record (we use a synthetic userId for email)
    const dbRecord = await this.repository.create({
      tenantId,
      userId: message.to,
      channel: NotificationChannel.EMAIL,
      status: NotificationStatus.PENDING,
      title: subject,
      body,
      metadata: undefined,
    });

    try {
      await withRetry(() =>
        this.transporter!.sendMail({
          from: this.smtp?.from ?? 'noreply@plexica.io',
          to: message.to,
          subject,
          text: body,
          html: message.htmlBody,
        })
      );

      await this.repository.updateStatus(dbRecord.id, NotificationStatus.SENT);

      // Note: do NOT log `to` (email address is PII — Art. 5.2, Constitution)
      logger.info({ tenantId, notifId: dbRecord.id }, '[NotificationService] email sent');
    } catch (err) {
      await this.repository.updateStatus(dbRecord.id, NotificationStatus.FAILED);
      throw Object.assign(err as Error, {
        code: NotificationErrorCode.SEND_FAILED,
        statusCode: 500,
      });
    }
  }

  // --------------------------------------------------------------------------
  // Push channel (stub — Firebase deferred per spec.md §10)
  // --------------------------------------------------------------------------

  async push(_tenantId: string, _message: PushMessage): Promise<void> {
    // Push notifications via Firebase deferred to Phase 3 (spec.md §10).
    logger.info('[NotificationService] push stub invoked — Firebase deferred');
  }

  // --------------------------------------------------------------------------
  // In-app channel — persists to notifications table, fan-out via Redis pub/sub
  // --------------------------------------------------------------------------

  async inApp(tenantId: string, message: InAppMessage): Promise<Notification> {
    const title = renderTemplate(message.title, {});
    const body = renderTemplate(message.body, {});

    const dbRecord = await this.repository.create({
      tenantId,
      userId: message.userId,
      channel: NotificationChannel.IN_APP,
      status: NotificationStatus.SENT,
      title,
      body,
      metadata: message.metadata,
    });

    logger.info(
      { tenantId, userId: message.userId, notifId: dbRecord.id },
      '[NotificationService] in-app notification persisted'
    );

    // Fan-out via Redis pub/sub handled at the route/SSE layer (T007-17)
    return {
      id: dbRecord.id,
      tenantId: dbRecord.tenantId,
      userId: dbRecord.userId,
      channel: NotificationChannel.IN_APP,
      status: NotificationStatus.SENT,
      title: dbRecord.title,
      body: dbRecord.body,
      metadata: dbRecord.metadata as Notification['metadata'],
      createdAt: dbRecord.createdAt,
      updatedAt: dbRecord.updatedAt,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createNotificationService(smtp: SmtpConfig | null = null): NotificationService {
  return new NotificationService(new NotificationRepository(), smtp);
}
