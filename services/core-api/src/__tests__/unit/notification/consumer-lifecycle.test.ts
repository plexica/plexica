// unit/notification/consumer-lifecycle.test.ts
// Unit tests for the notification consumer startup/shutdown race (fix 16a):
// a shutdown that begins while startup is pending must abort that startup
// (cleanup + throw) instead of letting it assign a consumer post-teardown.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const consumer = { connect: vi.fn(), subscribe: vi.fn(), run: vi.fn(), disconnect: vi.fn() };
  return {
    createConsumer: vi.fn(() => consumer),
    consumer,
    awaitOwnedHandlers: vi.fn(async () => undefined),
    waitForConsumerAssignment: vi.fn(async () => undefined),
    disconnectConsumerWithBudget: vi.fn(async () => undefined),
    trackHandler: vi.fn(),
    commitOffsetGuarded: vi.fn(async () => undefined),
    getConsumerGeneration: vi.fn(() => 1),
    isAssigned: vi.fn(() => true),
    parseWire: vi.fn(),
    getTenantEventKey: vi.fn(),
    decryptWireEvent: vi.fn(),
    isRetriablePrismaError: vi.fn(() => false),
    moveToNotificationDlq: vi.fn(),
    moveWireToNotificationDlq: vi.fn(),
    dlqErrorDetail: vi.fn(),
    processNotificationEvent: vi.fn(),
  };
});

vi.mock('../../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../lib/database.js', () => ({
  prisma: { tenant: { findUnique: vi.fn(async () => ({ status: 'active' })) } },
}));
vi.mock('../../../lib/kafka.js', () => ({
  createConsumer: mocks.createConsumer,
  Topics: {
    workspace: (action: string) => `plexica.workspace.${action}`,
    notification: 'plexica.notification',
  },
}));
vi.mock('../../../lib/kafka-consumer.js', () => ({
  awaitOwnedHandlers: mocks.awaitOwnedHandlers,
  commitOffsetGuarded: mocks.commitOffsetGuarded,
  getConsumerGeneration: mocks.getConsumerGeneration,
  isAssigned: mocks.isAssigned,
  trackHandler: mocks.trackHandler,
  waitForConsumerAssignment: mocks.waitForConsumerAssignment,
}));
vi.mock('../../../lib/kafka-errors.js', () => ({
  isRetriablePrismaError: mocks.isRetriablePrismaError,
}));
vi.mock('../../../lib/kafka-shutdown.js', () => ({
  disconnectConsumerWithBudget: mocks.disconnectConsumerWithBudget,
}));
vi.mock('../../../events/event-envelope.js', () => ({
  wireEventEnvelopeSchema: { parse: mocks.parseWire },
}));
vi.mock('../../../events/event-crypto.js', () => ({ decryptWireEvent: mocks.decryptWireEvent }));
vi.mock('../../../events/event-key-service.js', () => ({
  getTenantEventKey: mocks.getTenantEventKey,
}));
vi.mock('./consumer-dlq.js', () => ({
  moveToNotificationDlq: mocks.moveToNotificationDlq,
  moveWireToNotificationDlq: mocks.moveWireToNotificationDlq,
  dlqErrorDetail: mocks.dlqErrorDetail,
}));
vi.mock('./consumer-pipeline.js', () => ({
  processNotificationEvent: mocks.processNotificationEvent,
}));

type ConsumerModule = typeof import('../../../modules/notification/consumer.js');
let mod: ConsumerModule;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.consumer.connect.mockResolvedValue(undefined);
  mocks.consumer.subscribe.mockResolvedValue(undefined);
  mocks.consumer.run.mockResolvedValue(undefined);
  mocks.consumer.disconnect.mockResolvedValue(undefined);
  mod = await import('../../../modules/notification/consumer.js');
});

describe('notification consumer lifecycle (fix 16a)', () => {
  it('stop with nothing running returns immediately', async () => {
    await expect(mod.stopNotificationConsumer()).resolves.toBeUndefined();
    expect(mocks.createConsumer).not.toHaveBeenCalled();
  });

  it('start then stop disconnects the assigned consumer', async () => {
    await mod.startNotificationConsumer();
    await mod.stopNotificationConsumer();
    expect(mocks.disconnectConsumerWithBudget).toHaveBeenCalledTimes(1);
  });

  it('stop during pending startup aborts the startup and never assigns the consumer', async () => {
    let release!: () => void;
    mocks.consumer.connect.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const startPromise = mod.startNotificationConsumer();
    await vi.waitFor(() => expect(mocks.createConsumer).toHaveBeenCalledTimes(1));

    const stopPromise = mod.stopNotificationConsumer();
    release();

    await expect(startPromise).rejects.toThrow('NOTIF_CONSUMER_CLOSING');
    await stopPromise;
    expect(mocks.disconnectConsumerWithBudget).toHaveBeenCalledTimes(1);
  });

  it('start after shutdown rejects instead of serving a fresh consumer', async () => {
    await mod.stopNotificationConsumer();
    await expect(mod.startNotificationConsumer()).rejects.toThrow('NOTIF_CONSUMER_CLOSING');
  });
});
