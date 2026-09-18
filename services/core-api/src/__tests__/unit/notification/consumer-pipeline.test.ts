// unit/notification/consumer-pipeline.test.ts
// Unit tests for the notification consumer pipeline (fix 6, plan §5.2):
// (a) envelope-type routing, (b) dedupe-first order, (c) cap-breach suppression.
// Pure unit tests — repo/redis modules mocked, no DB/Keycloak/Kafka.

import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  resolveActiveTenantContext: vi.fn(),
  isUserRateLimited: vi.fn(),
  findProfileByEmail: vi.fn(),
  findConsumerProfile: vi.fn(),
  insertNotification: vi.fn(),
  readPreferences: vi.fn(),
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
  readPreferences: mocks.readPreferences,
  rowToNotificationDto: mocks.rowToNotificationDto,
}));
vi.mock('../../../modules/notification/service.js', () => ({
  deliverInApp: mocks.deliverInApp,
  resolveChannels: (prefs: { defaults: unknown; types: Record<string, unknown> }, type: string) =>
    prefs.types[type] ?? prefs.defaults,
}));

import { processNotificationEvent } from '../../../modules/notification/consumer-pipeline.js';
const TENANT_CTX = { tenantId: '11111111-1111-4111-8111-111111111111', slug: 'acme' };

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
    eventId: '44444444-4444-4444-8444-444444444444',
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
  mocks.readPreferences.mockResolvedValue({ defaults: { inApp: true, email: true }, types: {} });
  // deliverEmail: prefs → channels; enqueue only when the email channel is on.
  mocks.deliverEmail.mockImplementation(async (_db, _userId, _eventId, type, target) => {
    const prefs = await mocks.readPreferences();
    const channels = prefs.types[type] ?? prefs.defaults;
    if (channels.email && target.kind === 'invite') await mocks.enqueueInviteEmail();
    if (channels.email && target.kind === 'notification') await mocks.enqueueNotificationEmail();
    return channels;
  });
});

describe('envelope-type routing (fix 6a)', () => {
  it('routes plexica.workspace.invite to the invite path', async () => {
    mocks.findProfileByEmail.mockResolvedValue({ userId: 'u1' });
    mocks.insertNotification.mockResolvedValue({ inserted: true, row: { id: 'n1' } });
    mocks.isUserRateLimited.mockResolvedValue(false);
    await processNotificationEvent(inviteEvent() as never, INVITE_SRC);

    expect(mocks.findProfileByEmail).toHaveBeenCalledWith(mockDb, 'ada@example.com');
    expect(mocks.insertNotification.mock.calls[0]?.[1].type).toBe('workspace.invite');
    expect(mocks.deliverInApp).toHaveBeenCalledWith('acme', 'u1', expect.anything());
    expect(mocks.incrementEmitted).toHaveBeenCalled();
  });

  it('routes unknown envelope types to the plugin path', async () => {
    mocks.findConsumerProfile.mockResolvedValue({
      userId: 'u1',
      email: 'ada@example.com',
      notificationPrefs: {},
    });
    mocks.insertNotification.mockResolvedValue({ inserted: true, row: { id: 'n1' } });
    mocks.isUserRateLimited.mockResolvedValue(false);
    await processNotificationEvent(
      pluginEvent({
        userId: 'u1',
        type: 'plugin.crm.contact_created',
        titleKey: 't',
        titleParams: { name: 'Ada' },
      }) as never,
      PLUGIN_SRC
    );

    const insert = mocks.insertNotification.mock.calls[0]?.[1];
    expect(insert?.type).toBe('plugin.crm.contact_created');
    expect(insert?.metadata.titleParams).toEqual({ name: 'Ada' }); // fix 8 end-to-end
  });

  it('skips plugin events without a target userId', async () => {
    await processNotificationEvent(
      pluginEvent({ type: 'plugin.crm.contact_created', titleKey: 't' }) as never,
      PLUGIN_SRC
    );
    expect(mocks.insertNotification).not.toHaveBeenCalled();
  });

  it('skips non-tenant invitees (email handled atomically at creation) but counts the email-only delivery', async () => {
    mocks.findProfileByEmail.mockResolvedValue(null);
    await processNotificationEvent(inviteEvent() as never, INVITE_SRC);
    expect(mocks.insertNotification).not.toHaveBeenCalled();
    expect(mocks.enqueueInviteEmail).not.toHaveBeenCalled();
    // Fix 9: notifications_emitted_total must include the email-only path.
    expect(mocks.incrementEmitted).toHaveBeenCalled();
  });
});

describe('dedupe-first order (fix 6b)', () => {
  it('a duplicate event_id consumes no quota, no SSE, email recovery only', async () => {
    mocks.findProfileByEmail.mockResolvedValue({ userId: 'u1' });
    mocks.insertNotification.mockResolvedValue({ inserted: false, row: null });
    await processNotificationEvent(inviteEvent() as never, INVITE_SRC);

    expect(mocks.isUserRateLimited).not.toHaveBeenCalled();
    expect(mocks.deliverInApp).not.toHaveBeenCalled();
    expect(mocks.incrementEmitted).not.toHaveBeenCalled();
    expect(mocks.enqueueInviteEmail).toHaveBeenCalled();
  });

  it('same event_id twice → one delivery, second skipped with no quota', async () => {
    mocks.findProfileByEmail.mockResolvedValue({ userId: 'u1' });
    mocks.isUserRateLimited.mockResolvedValue(false);
    mocks.insertNotification.mockResolvedValueOnce({ inserted: true, row: { id: 'n1' } });
    mocks.insertNotification.mockResolvedValueOnce({ inserted: false, row: null });
    const event = inviteEvent() as never;
    await processNotificationEvent(event, INVITE_SRC);
    await processNotificationEvent(event, { ...INVITE_SRC, offset: '1' });

    expect(mocks.deliverInApp).toHaveBeenCalledTimes(1);
    expect(mocks.isUserRateLimited).toHaveBeenCalledTimes(1);
    expect(mocks.incrementEmitted).toHaveBeenCalledTimes(1);
  });
});

describe('cap breach (fix 6c)', () => {
  it('suppresses delivery, keeps the row persisted, no email enqueue', async () => {
    mocks.findProfileByEmail.mockResolvedValue({ userId: 'u1' });
    mocks.insertNotification.mockResolvedValue({ inserted: true, row: { id: 'n1' } });
    mocks.isUserRateLimited.mockResolvedValue(true);
    await processNotificationEvent(inviteEvent() as never, INVITE_SRC);

    expect(mocks.insertNotification).toHaveBeenCalled(); // row persisted
    expect(mocks.isUserRateLimited).toHaveBeenCalledWith(TENANT_CTX.tenantId, 'u1');
    expect(mocks.deliverInApp).not.toHaveBeenCalled();
    expect(mocks.enqueueInviteEmail).not.toHaveBeenCalled();
    expect(mocks.incrementEmitted).not.toHaveBeenCalled();
  });
});
