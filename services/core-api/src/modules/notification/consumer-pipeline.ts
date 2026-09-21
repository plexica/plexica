// consumer-pipeline.ts
// Per-event processing for the notification consumer — the ordered pipeline
// from plan §5.2 (dedupe-first): (1) insert-ignore by event_id (F6), (2)
// rowCount=0 → redelivery skip with no quota consumption, (3) 100/min/user cap
// check (F5) — breach suppresses delivery, the row stays, counter incremented,
// never DLQ — (4) resolve profile/prefs → channels → SSE + email enqueue.
// The step-4 email enqueue is event_id-keyed and idempotent (ON CONFLICT DO
// NOTHING), so a duplicate redelivery after a crash between step 1 and step 4
// re-attempts it — the email is never permanently lost. Plugin emissions are
// handled by consumer-plugin.ts (Rule 4 split).

import { logger } from '../../lib/logger.js';
import { withTenantDb } from '../../lib/tenant-database.js';

import { resolveActiveTenantContext, isUserRateLimited } from './consumer-cap.js';
import { deliverEmail } from './consumer-email.js';
import { incrementEmitted } from './consumer-metrics.js';
import { processPluginNotification } from './consumer-plugin.js';
import { findProfileByEmail, insertNotification, rowToNotificationDto } from './repository.js';
import { deliverInApp } from './service.js';

import type { SourceCoordinates } from '../../events/dlq-contract.js';
import type { DomainEventEnvelope } from '../../events/event-envelope.js';
import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { EmailTarget } from './consumer-email.js';
import type { PluginNotificationPayload } from './consumer-plugin.js';

const INVITE_TYPE = 'workspace.invite';
const INVITE_TITLE_KEY = 'notifications.workspace.invite.title';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InvitePayload {
  workspaceId?: string;
  workspaceName?: string;
  inviteeEmail?: string;
}

export async function processNotificationEvent(
  event: DomainEventEnvelope,
  _source: SourceCoordinates
): Promise<void> {
  const tenantCtx = await resolveActiveTenantContext(event);
  if (tenantCtx === null) return;

  const payload = event.payload as Record<string, unknown>;
  if (event.type === 'plexica.workspace.invite') {
    await processInvite(event, tenantCtx, payload as InvitePayload);
    return;
  }
  await processPluginNotification(event, tenantCtx, payload as PluginNotificationPayload);
}

async function processInvite(
  event: DomainEventEnvelope,
  tenantCtx: TenantContext,
  payload: InvitePayload
): Promise<void> {
  const inviteeEmail = payload.inviteeEmail;
  if (typeof inviteeEmail !== 'string' || inviteeEmail.length === 0) return;
  const workspaceId = payload.workspaceId;
  if (typeof workspaceId !== 'string' || !UUID_RE.test(workspaceId)) return;

  // Email-carried targets are resolved up-front (plan §5.2).
  const profile = await withTenantDb((db) => findProfileByEmail(db, inviteeEmail), tenantCtx);
  if (profile === null) {
    // Non-tenant invitee → email-only. The accept-link email was enqueued in
    // the SAME transaction as the invitation + outbox (service-create), so the
    // consumer has nothing to do (re-enqueuing would double-send). No in-app
    // row, no per-user cap (plan §5.2).
    logger.debug(
      { tenantId: tenantCtx.tenantId, eventId: event.eventId },
      'Invitee is not a tenant user — email-only path handled atomically at invitation creation'
    );
    // Count the email-only delivery — notifications_emitted_total must include
    // it even though no in-app row was created (fix 9).
    incrementEmitted();
    return;
  }

  const userId = profile.userId;
  const emailTarget: EmailTarget = {
    kind: 'invite',
    input: {
      tenantId: tenantCtx.tenantId,
      inviteeEmail,
      workspaceId,
      workspaceName: payload.workspaceName ?? '',
      eventId: event.eventId,
    },
  };

  const { inserted, row } = await withTenantDb(
    (db) =>
      insertNotification(db, {
        eventId: event.eventId,
        userId,
        type: INVITE_TYPE,
        titleKey: INVITE_TITLE_KEY,
        bodyKey: null,
        metadata: {
          workspaceId,
          workspaceName: payload.workspaceName,
          link: `/workspaces/${workspaceId}`,
        },
      }),
    tenantCtx
  );

  if (!inserted || row === null) {
    // Step 2 duplicate redelivery: no cap, no SSE re-push — BUT re-attempt the
    // idempotent email enqueue to recover a crash between step 1 and step 4.
    await withTenantDb(
      (db) => deliverEmail(db, userId, event.eventId, INVITE_TYPE, emailTarget),
      tenantCtx
    );
    return;
  }

  if (await isUserRateLimited(tenantCtx.tenantId, userId)) return; // step 3 breach

  const channels = await withTenantDb(
    (db) => deliverEmail(db, userId, event.eventId, INVITE_TYPE, emailTarget),
    tenantCtx
  );
  if (channels.inApp) deliverInApp(tenantCtx.slug, userId, rowToNotificationDto(row));
  incrementEmitted();
}
