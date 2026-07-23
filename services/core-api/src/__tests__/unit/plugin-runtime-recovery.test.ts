import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindMany: vi.fn(),
  pluginFindUnique: vi.fn(),
  installationFindMany: vi.fn(),
  createConsumerGroup: vi.fn(),
  dispatchEvent: vi.fn(),
  hasUsableCredential: vi.fn(),
  issueCredential: vi.fn(),
  completeRotation: vi.fn(),
  restartContainer: vi.fn(),
  installationUpdate: vi.fn(),
}));

vi.mock('../../lib/database.js', () => ({
  prisma: {
    tenant: { findMany: mocks.tenantFindMany },
    plugin: { findUnique: mocks.pluginFindUnique },
  },
}));
vi.mock('../../lib/tenant-database.js', () => ({
  withTenantDb: vi.fn(async (callback: (db: unknown) => Promise<unknown>) =>
    callback({
      pluginInstallation: {
        findMany: mocks.installationFindMany,
        update: mocks.installationUpdate,
      },
    })
  ),
}));
vi.mock('../../modules/plugin/events/consumer-manager.service.js', () => ({
  createConsumerGroup: mocks.createConsumerGroup,
}));
vi.mock('../../modules/plugin/events/event-dispatcher.service.js', () => ({
  dispatchEvent: mocks.dispatchEvent,
}));
vi.mock('../../modules/plugin/services/dev-backends.js', () => ({
  getDevBackendForInstallation: vi.fn(),
}));
vi.mock('../../modules/plugin/services/container-manager.service.js', () => ({
  createContainerManager: vi.fn(() => ({ restartContainer: mocks.restartContainer })),
}));
vi.mock('../../modules/plugin/services/service-credential.service.js', () => ({
  hasUsableInstallationCredential: mocks.hasUsableCredential,
  issueServiceCredential: mocks.issueCredential,
  completeCredentialRotation: mocks.completeRotation,
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { reconcilePluginRuntimes } from '../../modules/plugin/services/runtime-recovery.service.js';

const manifest = {
  slug: 'crm',
  name: 'CRM',
  version: '1.0.0',
  description: 'CRM plugin',
  author: 'Plexica',
  icon: 'Contact2',
  categories: [],
  hosting: { type: 'sidecar', image: 'crm:1.0.0', port: 3000 },
  events: { subscribes: ['plexica.workspace.created'] },
  declaredTables: [],
};

describe('reconcilePluginRuntimes', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.tenantFindMany.mockResolvedValue([{ id: 'tenant-id', slug: 'acme' }]);
    mocks.installationFindMany.mockResolvedValue([
      {
        id: 'install-id',
        pluginId: 'plugin-id',
        tenantSlug: 'acme',
        hostingType: 'sidecar',
      },
    ]);
    mocks.pluginFindUnique.mockResolvedValue({ id: 'plugin-id', slug: 'crm', manifest });
    mocks.createConsumerGroup.mockResolvedValue(undefined);
    mocks.hasUsableCredential.mockResolvedValue(true);
    mocks.issueCredential.mockResolvedValue({
      credentialId: 'credential-id',
      token: 'opaque-token',
    });
    mocks.completeRotation.mockResolvedValue(undefined);
    mocks.restartContainer.mockResolvedValue(undefined);
    mocks.installationUpdate.mockResolvedValue(undefined);
  });

  it('recreates subscriptions for persisted active runtimes', async () => {
    await expect(reconcilePluginRuntimes()).resolves.toEqual({ restored: 1, failed: 0 });
    expect(mocks.installationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantSlug: 'acme', status: { in: ['active', 'degraded'] } },
      })
    );
    expect(mocks.createConsumerGroup).toHaveBeenCalledWith(
      'install-id',
      'tenant-id',
      'acme',
      ['plexica.workspace.created'],
      expect.any(Function),
      'plugin-id'
    );
  });

  it('isolates a broken installation and reports the recovery failure', async () => {
    mocks.createConsumerGroup.mockRejectedValueOnce(new Error('Kafka unavailable'));
    await expect(reconcilePluginRuntimes()).resolves.toEqual({ restored: 0, failed: 1 });
  });

  it('rotates a legacy runtime that has no usable installation credential', async () => {
    mocks.hasUsableCredential.mockResolvedValueOnce(false);
    await expect(reconcilePluginRuntimes()).resolves.toEqual({ restored: 1, failed: 0 });
    expect(mocks.restartContainer).toHaveBeenCalledWith('install-id', {
      PLEXICA_SERVICE_TOKEN: 'opaque-token',
    });
    expect(mocks.completeRotation).toHaveBeenCalledWith('install-id', 'credential-id', true);
  });
});
