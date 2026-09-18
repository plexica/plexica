// consumer-email.ts
// Email enqueues performed by the notification consumer (step 4, plan §5.2).
// All enqueues are keyed by the event_id (`dedupe_key` in core.email_queue,
// ON CONFLICT DO NOTHING) so a crash between the row insert and the email
// enqueue is recoverable on redelivery — never double-sent, never lost.

import { Prisma } from '@prisma/client';

import { config } from '../../lib/config.js';
import { prisma } from '../../lib/database.js';
import { escapeHtml, renderInvitationHtml } from '../../lib/email.js';

import { enqueueEmailRaw } from './email-queue.service.js';
import { readPreferences } from './repository.js';
import { resolveChannels } from './service.js';

import type { TenantDbClient } from '../../lib/tenant-database.js';
import type { RawSqlClient } from './email-queue.service.js';
import type { NotificationChannel } from './types.js';

export interface InviteEmailInput {
  tenantId: string;
  inviteeEmail: string;
  workspaceId: string;
  workspaceName: string;
  /** Consumer event_id — idempotency key for the enqueue. */
  eventId: string;
}

/**
 * Enqueues the accept-link invitation email for a TENANT user whose prefs have
 * the email channel on. The invitation must still be pending — otherwise the
 * link is stale and the email is skipped (delivery is best-effort; the in-app
 * notification is already persisted). Idempotent on `eventId`.
 */
export async function enqueueInviteEmail(db: RawSqlClient, input: InviteEmailInput): Promise<void> {
  const invitation = await db.$queryRaw<Array<{ token: string }>>(Prisma.sql`
    SELECT token FROM invitation
    WHERE email = ${input.inviteeEmail}
      AND workspace_id = ${input.workspaceId}::uuid
      AND status = 'pending'
    LIMIT 1
  `);
  const token = invitation[0]?.token;
  if (token === undefined) return;
  const inviteUrl = `${config.APP_URL}/invite/${token}`;
  await enqueueEmailRaw(db, {
    tenantId: input.tenantId,
    toAddress: input.inviteeEmail,
    subject: `You've been invited to ${input.workspaceName}`,
    htmlBody: renderInvitationHtml(inviteUrl, input.workspaceName),
    emailType: 'workspace.invite',
    eventId: input.eventId,
  });
}

export interface NotificationEmailInput {
  tenantId: string;
  toAddress: string;
  type: string;
  titleKey: string;
  /** Consumer event_id — idempotency key for the enqueue. */
  eventId: string;
}

/** Discriminated email target for the shared channel-delivery helper. */
export type EmailTarget =
  | { kind: 'invite'; input: InviteEmailInput }
  | { kind: 'notification'; input: NotificationEmailInput };

/**
 * Reads prefs and delivers the EMAIL channel (idempotent, event_id-keyed).
 * Returns the resolved channels so the caller can push in-app without a second
 * prefs read. Runs inside the tenant transaction callback. Used for both new
 * rows and duplicate redeliveries (email recovery, fix 5).
 */
export async function deliverEmail(
  db: TenantDbClient,
  userId: string,
  eventId: string,
  type: string,
  target: EmailTarget
): Promise<NotificationChannel> {
  const prefs = await readPreferences(db, userId);
  const channels = resolveChannels(prefs, type);
  if (channels.email) {
    if (target.kind === 'invite') await enqueueInviteEmail(db, target.input);
    else await enqueueNotificationEmail(target.input);
  }
  return channels;
}

/**
 * Enqueues a generic notification email for plugin emissions. Titles are i18n
 * keys resolved by the UI, so the email links to the notification center
 * rather than embedding an unresolved key (Security §6 — no PII). titleParams
 * (interpolation values for the title key) deliberately ride the persisted row
 * metadata + SSE DTO only; a localized title renderer is a Phase 3 placeholder
 * if the center link is ever replaced with a resolved title.
 */
export async function enqueueNotificationEmail(input: NotificationEmailInput): Promise<void> {
  const centerUrl = `${config.APP_URL}/notifications`;
  await enqueueEmailRaw(prisma, {
    tenantId: input.tenantId,
    toAddress: input.toAddress,
    subject: 'New notification in Plexica',
    htmlBody: renderNotificationHtml(centerUrl, input.type),
    emailType: 'notification',
    eventId: input.eventId,
  });
}

function renderNotificationHtml(centerUrl: string, type: string): string {
  return `
    <h1>You have a new notification</h1>
    <p>Open the Plexica notification center to see the details:</p>
    <p><a href="${centerUrl}">${centerUrl}</a></p>
    <hr />
    <p style="color:#888;font-size:12px;">${escapeHtml(type)}</p>
  `.trim();
}
