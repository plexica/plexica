// notification.int.helpers.ts
// Shared fixtures for the notification integration suites (routes + consumer,
// features 006-01/02/05). Extracted to honor the 200-line gate (Rule 4).

import { ensureTenantEventKey } from '../../events/event-key-service.js';
import { buildDomainEvent } from '../../events/event-envelope.js';
import { encryptDomainEvent } from '../../events/event-crypto.js';
import { handleNotificationMessage } from '../../modules/notification/consumer.js';
import { insertNotification } from '../../modules/notification/repository.js';
import { withTenantDb } from '../../lib/tenant-database.js';

import type { JsonObject } from '../../events/event-envelope.js';
import type { SourceCoordinates } from '../../events/dlq-contract.js';
import type { TenantContext } from '../../lib/tenant-context-store.js';

export const CONSUMER_USER_ID = '00000000-0302-0001-0000-000000000001';
export const CONSUMER_EMAIL = 'consumer@test.plexica.io';

export const INVITE_SOURCE: SourceCoordinates = {
  topic: 'plexica.workspace.invite',
  partition: 0,
  offset: '0',
};
export const NOTIFICATION_SOURCE: SourceCoordinates = {
  topic: 'plexica.notification',
  partition: 0,
  offset: '0',
};

/** Consumer cap counter key (mirrors consumer-cap.ts). */
export function capKey(tenantId: string, userId: string): string {
  return `notification:${tenantId}:${userId}:emit`;
}

/** Seeds a notification row directly (routes suite). Returns the row id. */
export async function seedNotification(
  tenantCtx: TenantContext,
  userId: string,
  type = 'workspace.invite'
): Promise<string> {
  const eventId = crypto.randomUUID();
  const { row } = await withTenantDb(
    (db) =>
      insertNotification(db, {
        eventId,
        userId,
        type,
        titleKey: 'notifications.workspace.invite.title',
        bodyKey: null,
        metadata: { link: '/workspaces/abc' },
      }),
    tenantCtx
  );
  return row?.id ?? '';
}

async function processEvent(
  tenantCtx: TenantContext,
  keyVersion: number,
  key: Buffer,
  eventId: string,
  envelopeType: string,
  source: SourceCoordinates,
  payload: JsonObject,
  producer: { kind: 'core'; id: 'core' } | { kind: 'plugin'; id: string }
): Promise<void> {
  const event = buildDomainEvent({
    eventId,
    type: envelopeType,
    tenantId: tenantCtx.tenantId,
    producer,
    correlationId: eventId,
    payload,
  });
  const wire = encryptDomainEvent(event, keyVersion, key);
  await handleNotificationMessage({
    value: JSON.stringify(wire),
    source: { ...source, offset: String(Date.now()) },
  });
}

/** Runs a real encrypted workspace.invite event through the consumer pipeline. */
export async function processInviteEvent(
  tenantCtx: TenantContext,
  keyVersion: number,
  key: Buffer,
  overrides: { eventId: string; inviteeEmail: string }
): Promise<void> {
  await processEvent(
    tenantCtx,
    keyVersion,
    key,
    overrides.eventId,
    'plexica.workspace.invite',
    INVITE_SOURCE,
    {
      workspaceId: crypto.randomUUID(),
      workspaceName: 'Consumer WS',
      inviteeEmail: overrides.inviteeEmail,
      invitedBy: CONSUMER_USER_ID,
      role: 'member',
    },
    { kind: 'core', id: 'core' }
  );
}

/** Runs a real encrypted plugin-emission event through the consumer pipeline. */
export async function processPluginEvent(
  tenantCtx: TenantContext,
  keyVersion: number,
  key: Buffer,
  overrides: { eventId: string; type: string; userId?: string }
): Promise<void> {
  await processEvent(
    tenantCtx,
    keyVersion,
    key,
    overrides.eventId,
    'plexica.notification',
    NOTIFICATION_SOURCE,
    {
      userId: overrides.userId ?? CONSUMER_USER_ID,
      type: overrides.type,
      titleKey: 'notifications.plugin.crm.contact_created.title',
      notificationId: overrides.eventId,
    },
    { kind: 'plugin', id: '00000000-0302-0003-0000-000000000001' }
  );
}

/** Counts rows for an event_id (consumer insert-ignore dedupe assertions). */
export async function notificationCount(
  tenantCtx: TenantContext,
  eventId: string
): Promise<number> {
  return withTenantDb(
    (db) => db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM notifications WHERE event_id = ${eventId}
    `,
    tenantCtx
  ).then((rows) => Number(rows[0]?.count ?? 0));
}

export { ensureTenantEventKey };