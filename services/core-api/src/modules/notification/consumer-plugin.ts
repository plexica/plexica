// consumer-plugin.ts
// Plugin-emission processing for the notification consumer (plan §5.2 step 4).
// Split from consumer-pipeline.ts for the 200-line gate (Rule 4). The type
// length is guarded against the DB VARCHAR(63) bound — an over-length type is a
// permanent producer error that surfaces to the DLQ, never a mid-pipeline DB
// error.

import { logger } from '../../lib/logger.js';
import { withTenantDb } from '../../lib/tenant-database.js';

import { isUserRateLimited } from './consumer-cap.js';
import { deliverEmail } from './consumer-email.js';
import { incrementEmitted } from './consumer-metrics.js';
import { findConsumerProfile, insertNotification, rowToNotificationDto } from './repository.js';
import { deliverInApp } from './service.js';

import type { DomainEventEnvelope } from '../../events/event-envelope.js';
import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { EmailTarget } from './consumer-email.js';

/** DB bound for notifications.type (VARCHAR(63)) — over-length → DLQ, not DB error. */
const MAX_TYPE_LENGTH = 63;

export interface PluginNotificationPayload {
  userId?: string;
  type?: string;
  titleKey?: string;
  titleParams?: Record<string, string>;
  bodyKey?: string | null;
  metadata?: Record<string, unknown>;
  notificationId?: string;
  event_id?: string;
}

export async function processPluginNotification(
  event: DomainEventEnvelope,
  tenantCtx: TenantContext,
  payload: PluginNotificationPayload
): Promise<void> {
  if (typeof payload.userId !== 'string' || payload.userId.length === 0) return;
  if (typeof payload.type !== 'string' || typeof payload.titleKey !== 'string') return;
  if (payload.type.length > MAX_TYPE_LENGTH) {
    throw new Error('NOTIF_INVALID_TYPE_LENGTH');
  }

  // Resolve the target profile up-front: a missing profile means the row FK
  // would fail, and there is nobody to deliver to.
  const profile = await withTenantDb(
    (db) => findConsumerProfile(db, payload.userId as string),
    tenantCtx
  );
  if (profile === null) {
    logger.debug(
      { tenantId: tenantCtx.tenantId, eventId: event.eventId },
      'Notification target user profile not found — skipped'
    );
    return;
  }

  const userId = profile.userId;
  const eventId = typeof payload.event_id === 'string' ? payload.event_id : event.eventId;
  const emailTarget: EmailTarget = {
    kind: 'notification',
    input: {
      tenantId: tenantCtx.tenantId,
      toAddress: profile.email,
      type: payload.type as string,
      titleKey: payload.titleKey as string,
      eventId,
    },
  };

  const { inserted, row } = await withTenantDb(
    (db) =>
      insertNotification(db, {
        eventId,
        userId,
        type: payload.type as string,
        titleKey: payload.titleKey as string,
        bodyKey: payload.bodyKey ?? null,
        metadata: {
          ...(payload.metadata ?? {}),
          // titleParams (i18n interpolation values) ride the row metadata so
          // the SSE DTO / center UI can resolve the title key end-to-end.
          ...(payload.titleParams === undefined ? {} : { titleParams: payload.titleParams }),
        },
        ...(payload.notificationId === undefined ? {} : { notificationId: payload.notificationId }),
      }),
    tenantCtx
  );

  if (!inserted || row === null) {
    // Step 2 duplicate redelivery: recover the idempotent email enqueue only.
    await withTenantDb(
      (db) => deliverEmail(db, userId, eventId, payload.type as string, emailTarget),
      tenantCtx
    );
    return;
  }

  if (await isUserRateLimited(tenantCtx.tenantId, userId)) return; // step 3 breach

  const channels = await withTenantDb(
    (db) => deliverEmail(db, userId, eventId, payload.type as string, emailTarget),
    tenantCtx
  );
  if (channels.inApp) deliverInApp(tenantCtx.slug, userId, rowToNotificationDto(row));
  incrementEmitted();
}
