import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  corePluginFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  installationFindFirst: vi.fn(),
  workspaceFindFirst: vi.fn(),
  membershipFindUnique: vi.fn(),
  evaluate: vi.fn(),
  isVisible: vi.fn(),
}));

vi.mock('../../lib/redis.js', () => ({ redis: {} }));
vi.mock('../../modules/abac/engine.js', () => ({ evaluate: mocks.evaluate }));
vi.mock('../../modules/plugin/services/visibility.service.js', () => ({
  isPluginVisible: mocks.isVisible,
}));
vi.mock('../../lib/tenant-database.js', () => ({
  withCoreDb: vi.fn(async (callback: (db: unknown) => Promise<unknown>) =>
    callback({
      tenant: { findUnique: mocks.tenantFindUnique },
      plugin: { findUnique: mocks.corePluginFindUnique },
    })
  ),
  withTenantDb: vi.fn(async (callback: (db: unknown) => Promise<unknown>) =>
    callback({
      pluginInstallation: { findFirst: mocks.installationFindFirst },
      workspace: { findFirst: mocks.workspaceFindFirst },
      workspaceMember: { findUnique: mocks.membershipFindUnique },
    })
  ),
}));

import { authorizePluginProxy } from '../../modules/plugin/services/proxy-authorization.service.js';

const manifest = {
  slug: 'crm',
  name: 'CRM',
  version: '1.0.0',
  description: 'CRM plugin',
  author: 'Plexica',
  icon: 'Contact2',
  categories: [],
  declaredTables: [],
  hosting: { type: 'sidecar', image: 'crm:1.0.0', port: 3210 },
};

function authorize() {
  return authorizePluginProxy({
    installId: '123e4567-e89b-42d3-a456-426614174000',
    workspaceId: '223e4567-e89b-42d3-a456-426614174000',
    userId: 'user-id',
    isTenantAdmin: false,
    tenantContext: { tenantId: 'tenant-id', slug: 'acme' } as never,
  });
}

describe('authorizePluginProxy manifest port exposure', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.tenantFindUnique.mockResolvedValue({ slug: 'acme', status: 'active' });
    mocks.installationFindFirst.mockResolvedValue({
      hostingType: 'docker',
      pluginId: 'plugin-id',
    });
    mocks.workspaceFindFirst.mockResolvedValue({ id: 'workspace-id' });
    mocks.membershipFindUnique.mockResolvedValue({ role: 'member' });
    mocks.isVisible.mockResolvedValue(true);
    mocks.evaluate.mockResolvedValue({ allowed: true });
    mocks.corePluginFindUnique.mockResolvedValue({ slug: 'crm', manifest });
  });

  it('exposes the declared sidecar port from a valid published manifest', async () => {
    await expect(authorize()).resolves.toMatchObject({ manifestPort: 3210 });
    expect(mocks.corePluginFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: { slug: true, manifest: true } })
    );
  });

  it('omits manifestPort when the stored manifest does not parse', async () => {
    mocks.corePluginFindUnique.mockResolvedValueOnce({ slug: 'crm', manifest: {} });
    const access = await authorize();
    expect(access.manifestPort).toBeUndefined();
    expect(access.pluginSlug).toBe('crm');
  });
});
