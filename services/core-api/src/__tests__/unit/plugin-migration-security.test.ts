import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  grant: vi.fn(),
  revoke: vi.fn(),
  drop: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('../../modules/plugin/services/db-role.service.js', () => ({
  grantCreateOnSchema: mocks.grant,
  revokeCreateOnSchema: mocks.revoke,
  dropPluginRole: mocks.drop,
}));
vi.mock('../../lib/tenant-database.js', () => ({
  withTenantDb: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    pluginInstallation: { update: mocks.update },
    pluginContainerConfig: { deleteMany: mocks.deleteMany },
  })),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runMigrationSecurityPhase } from '../../modules/plugin/services/install-failure.service.js';

const INSTALL_ID = '55000000-0000-4000-8000-000000000005';
const CONTEXT = {
  tenantId: '66000000-0000-4000-8000-000000000006',
  slug: 'acme',
  schemaName: 'tenant_acme',
  realmName: 'plexica-acme',
};

describe('runMigrationSecurityPhase', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset().mockResolvedValue(undefined);
  });

  it('completes only after CREATE has been revoked and verified', async () => {
    const migrate = vi.fn().mockResolvedValue(undefined);
    await runMigrationSecurityPhase(INSTALL_ID, CONTEXT, migrate);
    expect(mocks.grant).toHaveBeenCalledWith(INSTALL_ID, 'acme');
    expect(migrate).toHaveBeenCalledOnce();
    expect(mocks.revoke).toHaveBeenCalledWith(INSTALL_ID, 'acme');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('marks failed, clears credentials, and drops the role when revoke fails', async () => {
    const revokeError = new Error('REVOKE failed');
    mocks.revoke.mockRejectedValueOnce(revokeError);

    await expect(
      runMigrationSecurityPhase(INSTALL_ID, CONTEXT, vi.fn().mockResolvedValue(undefined)),
    ).rejects.toBe(revokeError);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: INSTALL_ID },
      data: { status: 'failed' },
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { installId: INSTALL_ID } });
    expect(mocks.drop).toHaveBeenCalledWith(INSTALL_ID, 'acme');
  });
});
