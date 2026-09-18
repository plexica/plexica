// unit/notification/consumer-pipeline-validations.test.ts
// Unit tests for the consumer pipeline input guards (fixes 7 + 8):
// (a) an invite event without a workspaceId is rejected up-front instead of
//     dead-lettering on a `::uuid` cast of an empty string,
// (b) payload.event_id can no longer override the envelope eventId — the
//     envelope UUID stays the dedupe key for notifications + email queue.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveActiveTenantContext: vi.fn(),
  isUserRateLimited: vi.fn(),
  findProfileByEmail: vi.fn(),
  findConsumerProfile: vi.fn(),
  insertNotification: vi.fn(),
  rowToNotificationDto: vi.fn((row: unknown) => row),
  deliverInApp: vi.fn(),
  deliverEmail: vi.fn(),
  enqueueInviteEmail: vi.fn(),
  enqueueNotificationEmail: vi.fn(),
  incrementEmitted: vi.fn(),
}));

const mockDb = {};
const INVITE_SRC = { topic: 'plexica.workspace.invite', partition: 0, offset: '0' };
const PLUGIN_SRC = { topic: 'plexica.notification', partition: 0, offset: '0' };
const TENANT_CTX = { tenantId: '11111111-1111-4111-8111-111111111111', slug: 'acme' };
const ENVELOPE_EVENT_ID = '44444444-4444-4444-8444-444444444444';

vi.mock('../../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../lib/tenant-database.js', () => ({
  withTenantDb: (fn: (db: unknown) => Promise<unknown>) => fn(mockDb),
}));
vi.mock('../../../modules/notification/consumer-cap.js', () => ({
  resolveActiveTenantContext: mocks.resolveActiveTenantContext,
  isUserRateLimited: mocks.isUserRateLimited,
}));
vi.mock('../../../modules/notification/consumer-email.js', () => ({
  deliverEmail: mocks.deliverEmail,
  enqueueInviteEmail: mocks.enqueueInviteEmail,
  enqueueNotificationEmail: mocks.enqueueNotificationEmail,
}));
vi.mock('../../../modules/notification/consumer-metrics.js', () => ({
  incrementEmitted: mocks.incrementEmitted,
}));
vi.mock('../../../modules/notification/repository.js', () => ({
  findProfileByEmail: mocks.findProfileByEmail,
  findConsumerProfile: mocks.findConsumerProfile,
  insertNotification: mocks.insertNotification,
  rowToNotificationDto: mocks.rowToNotificationDto,
}));
vi.mock('../../../modules/notification/service.js', () => ({
  deliverInApp: mocks.deliverInApp,
  resolveChannels: (prefs: { defaults: unknown; types: Record<string, unknown> }, type: string) =>
    prefs.types[type] ?? prefs.defaults,
}));

import { processNotificationEvent } from '../../../modules/notification/consumer-pipeline.js';

function inviteEvent(payload: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: '22222222-2222-4222-8222-222222222222',
    type: 'plexica.workspace.invite',
    schemaVersion: 1,
    tenantId: TENANT_CTX.tenantId,
    occurredAt: new Date().toISOString(),
    producer: { kind: 'core', id: 'core' },
    correlationId: '33333333-3333-4333-8333-333333333333',
    causationId: null,
    payload: {
      workspaceId: 'w1',
      workspaceName: 'Acme',
      inviteeEmail: 'ada@example.com',
      ...payload,
    },
  };
}

function pluginEvent(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    eventId: ENVELOPE_EVENT_ID,
    type: 'plexica.notification',
    schemaVersion: 1,
    tenantId: TENANT_CTX.tenantId,
    occurredAt: new Date().toISOString(),
    producer: { kind: 'plugin', id: '55555555-5555-4555-8555-555555555555' },
    correlationId: '66666666-6666-4666-8666-666666666666',
    causationId: null,
    payload,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveActiveTenantContext.mockResolvedValue(TENANT_CTX);
  mocks.isUserRateLimited.mockResolvedValue(false);
  mocks.findConsumerProfile.mockResolvedValue({
    userId: 'u1',
    email: 'ada@example.com',
    notificationPrefs: {},
  });
  mocks.deliverEmail.mockResolvedValue({ inApp: true, email: true });
});

describe('invite workspaceId guard (fix 7)', () => {
  it('skips the event when workspaceId is missing', async () => {
    await processNotificationEvent(inviteEvent({ workspaceId: undefined }) as never, INVITE_SRC);
    expect(mocks.findProfileByEmail).not.toHaveBeenCalled();
    expect(mocks.insertNotification).not.toHaveBeenCalled();
    expect(mocks.deliverEmail).not.toHaveBeenCalled();
    expect(mocks.incrementEmitted).not.toHaveBeenCalled();
  });

  it('skips the event when workspaceId is an empty string', async () => {
    await processNotificationEvent(inviteEvent({ workspaceId: '' }) as never, INVITE_SRC);
    expect(mocks.insertNotification).not.toHaveBeenCalled();
    expect(mocks.deliverEmail).not.toHaveBeenCalled();
  });

  it('reuses the validated workspaceId for the email input and metadata link', async () => {
    mocks.findProfileByEmail.mockResolvedValue({ userId: 'u1' });
    mocks.insertNotification.mockResolvedValue({ inserted: true, row: { id: 'n1' } });
    await processNotificationEvent(inviteEvent() as never, INVITE_SRC);

    const target = mocks.deliverEmail.mock.calls[0]?.[4] as {
      kind: string;
      input: Record<string, unknown>;
    };
    expect(target.kind).toBe('invite');
    expect(target.input.workspaceId).toBe('w1');
    const metadata = mocks.insertNotification.mock.calls[0]?.[1].metadata;
    expect(metadata.link).toBe('/workspaces/w1');
  });
});

describe('plugin payload event_id override (fix 8)', () => {
  it('always uses the envelope eventId, ignoring payload.event_id', async () => {
    mocks.insertNotification.mockResolvedValue({ inserted: true, row: { id: 'n1' } });
    await processNotificationEvent(
      pluginEvent({
        userId: 'u1',
        type: 'plugin.crm.contact_created',
        titleKey: 't',
        event_id: '99999999-9999-4999-8999-999999999999',
      }) as never,
      PLUGIN_SRC
    );

    expect(mocks.insertNotification.mock.calls[0]?.[1].eventId).toBe(ENVELOPE_EVENT_ID);
    expect(mocks.deliverEmail.mock.calls[0]?.[2]).toBe(ENVELOPE_EVENT_ID);
  });
});
