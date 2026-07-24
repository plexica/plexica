import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  recover: vi.fn(),
  disable: vi.fn(),
  enable: vi.fn(),
  resetBreaker: vi.fn(),
}));

vi.mock('../../lib/tenant-database.js', () => ({
  withTenantDb: vi.fn(async (callback: (db: unknown) => Promise<unknown>) =>
    callback({ pluginInstallation: { findMany: mocks.findMany } })
  ),
}));
vi.mock('../../modules/plugin/events/consumer-manager.service.js', () => ({
  pauseConsumerGroup: mocks.pause,
  resumeConsumerGroup: mocks.resume,
}));
vi.mock('../../modules/plugin/services/container-manager.service.js', () => ({
  createContainerManager: vi.fn(() => ({
    stopContainer: mocks.stop,
    restartContainer: mocks.restart,
  })),
}));
vi.mock('../../modules/plugin/services/runtime-recovery.service.js', () => ({
  recoverInstallationConsumer: mocks.recover,
}));
vi.mock('../../modules/plugin/services/dev-backends.js', () => ({
  disableDevBackend: mocks.disable,
  enableDevBackend: mocks.enable,
}));
vi.mock('../../modules/plugin/services/health-check.service.js', () => ({
  resetBreaker: mocks.resetBreaker,
}));

import {
  pauseTenantPluginRuntime,
  resumeTenantPluginRuntime,
} from '../../modules/plugin/services/tenant-runtime-lifecycle.service.js';

const RUNTIME = {
  id: 'install-id', pluginId: 'plugin-id', tenantSlug: 'acme', hostingType: 'sidecar',
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.findMany.mockResolvedValue([RUNTIME]);
});

describe('tenant plugin runtime lifecycle', () => {
  it('disables proxy and consumer state before stopping a suspended runtime', async () => {
    await pauseTenantPluginRuntime('tenant-id', 'acme');

    expect(mocks.disable).toHaveBeenCalledWith('install-id');
    expect(mocks.pause).toHaveBeenCalledWith('install-id', 'acme');
    expect(mocks.stop).toHaveBeenCalledWith('install-id');
    expect(mocks.disable.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.stop.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('attempts container shutdown when consumer pause fails', async () => {
    mocks.pause.mockRejectedValueOnce(new Error('Kafka unavailable'));

    await expect(pauseTenantPluginRuntime('tenant-id', 'acme'))
      .rejects.toThrow('Kafka unavailable');
    expect(mocks.stop).toHaveBeenCalledWith('install-id');
    expect(mocks.disable).toHaveBeenCalledWith('install-id');
  });

  it('enables the proxy only after runtime and consumer convergence', async () => {
    await resumeTenantPluginRuntime('tenant-id', 'acme');

    expect(mocks.restart).toHaveBeenCalledWith('install-id');
    expect(mocks.resetBreaker).toHaveBeenCalledWith('install-id');
    expect(mocks.recover).toHaveBeenCalledWith({ ...RUNTIME, tenantId: 'tenant-id' });
    expect(mocks.resume).toHaveBeenCalledWith('install-id', 'acme');
    expect(mocks.enable).toHaveBeenCalledWith('install-id');
    expect(mocks.resume.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enable.mock.invocationCallOrder[0] ?? 0
    );
  });
});
