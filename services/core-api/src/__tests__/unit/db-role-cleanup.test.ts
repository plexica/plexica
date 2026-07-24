import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../../lib/database.js', () => ({
  prisma: {
    $executeRawUnsafe: mocks.execute,
    $queryRawUnsafe: mocks.query,
  },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { revokeCreateOnSchema } from '../../modules/plugin/services/db-role-cleanup.service.js';

const INSTALL_ID = '55000000-0000-4000-8000-000000000005';

describe('revokeCreateOnSchema', () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.query.mockReset();
    mocks.execute.mockResolvedValue(0);
    mocks.query.mockResolvedValue([{ hasCreate: false }]);
  });

  it('verifies the runtime role no longer has schema CREATE', async () => {
    await expect(revokeCreateOnSchema(INSTALL_ID, 'acme')).resolves.toBeUndefined();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('has_schema_privilege'),
      'plugin_55000000_0000_4000_8000_000000000005',
      'tenant_acme',
    );
  });

  it('fails closed when REVOKE itself fails', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('permission denied'));
    await expect(revokeCreateOnSchema(INSTALL_ID, 'acme')).rejects.toThrow('permission denied');
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('fails closed when effective CREATE privilege remains', async () => {
    mocks.query.mockResolvedValueOnce([{ hasCreate: true }]);
    await expect(revokeCreateOnSchema(INSTALL_ID, 'acme')).rejects.toThrow(
      'still has CREATE on schema tenant_acme',
    );
  });
});
