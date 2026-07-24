import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../../lib/config.js', () => ({
  config: { ABAC_CACHE_TTL_SECONDS: 300, ABAC_DECISION_LOG_SAMPLE_RATE: 1 },
}));
vi.mock('../../modules/abac/engine-helpers.js', () => ({
  getMembership: vi.fn(),
  getPluginActionOverride: vi.fn(),
  getPluginActionDefaultRole: vi.fn(),
  membershipCacheKey: vi.fn(),
}));

import { evaluate } from '../../modules/abac/engine.js';
import {
  getMembership,
  getPluginActionDefaultRole,
  getPluginActionOverride,
} from '../../modules/abac/engine-helpers.js';

import type { CachedMembership } from '../../modules/abac/engine-helpers.js';
import type { AbacContext } from '../../modules/abac/types.js';

const mockGetMembership = vi.mocked(getMembership);
const mockGetPluginOverride = vi.mocked(getPluginActionOverride);
const mockGetPluginDefaultRole = vi.mocked(getPluginActionDefaultRole);
const fakeRedis = {} as Parameters<typeof evaluate>[2];
const fakeTenantDb = {};
const nonMember: CachedMembership = { role: null, isTenantAdmin: false };

function makeCtx(action: string, overrides: Partial<AbacContext> = {}): AbacContext {
  return {
    userId: 'user-1',
    workspaceId: 'ws-1',
    tenantSlug: 'acme',
    action,
    isTenantAdmin: false,
    ...overrides,
  };
}

function memberOf(role: 'admin' | 'member' | 'viewer'): CachedMembership {
  return { role, isTenantAdmin: false };
}

beforeEach(() => {
  mockGetMembership.mockReset();
  mockGetPluginOverride.mockReset().mockResolvedValue(null);
  mockGetPluginDefaultRole.mockReset().mockResolvedValue(null);
});

describe('ABAC plugin action default-role fallback', () => {
  it('uses the registered default role', async () => {
    mockGetMembership.mockResolvedValue(memberOf('member'));
    mockGetPluginDefaultRole.mockResolvedValue('member');
    const ctx = makeCtx('crm:access', { pluginActionKey: 'crm:access' });
    const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
    expect(decision.decision).toBe('allow');
    expect(mockGetPluginDefaultRole).toHaveBeenCalledWith(ctx, fakeTenantDb);
  });

  it('denies a viewer when the registered default role is member', async () => {
    mockGetMembership.mockResolvedValue(memberOf('viewer'));
    mockGetPluginDefaultRole.mockResolvedValue('member');
    const decision = await evaluate(
      makeCtx('crm:access', { pluginActionKey: 'crm:access' }),
      fakeTenantDb,
      fakeRedis
    );
    expect(decision.decision).toBe('deny');
  });

  it('falls back to viewer when the action is not registered', async () => {
    mockGetMembership.mockResolvedValue(memberOf('viewer'));
    const decision = await evaluate(
      makeCtx('crm:access', { pluginActionKey: 'crm:access' }),
      fakeTenantDb,
      fakeRedis
    );
    expect(decision.decision).toBe('allow');
  });

  it('denies non-members with the viewer fallback', async () => {
    mockGetMembership.mockResolvedValue(nonMember);
    const decision = await evaluate(
      makeCtx('crm:access', { pluginActionKey: 'crm:access' }),
      fakeTenantDb,
      fakeRedis
    );
    expect(decision.decision).toBe('deny');
    expect(decision.reason).toContain('not a workspace member');
  });

  it('uses a DB-verified role without consulting membership cache', async () => {
    mockGetPluginDefaultRole.mockResolvedValue('member');
    const decision = await evaluate(
      makeCtx('crm:access', {
        pluginActionKey: 'crm:access',
        verifiedWorkspaceRole: 'viewer',
      }),
      fakeTenantDb,
      fakeRedis
    );
    expect(decision.decision).toBe('deny');
    expect(mockGetMembership).not.toHaveBeenCalled();
  });
});

describe('ABAC plugin action override', () => {
  it('can lower the required role', async () => {
    mockGetMembership.mockResolvedValue(memberOf('viewer'));
    mockGetPluginOverride.mockResolvedValue('viewer');
    const decision = await evaluate(
      makeCtx('member:invite', { pluginActionKey: 'crm:invite' }),
      fakeTenantDb,
      fakeRedis
    );
    expect(decision.decision).toBe('allow');
  });

  it('can raise the required role', async () => {
    mockGetMembership.mockResolvedValue(memberOf('member'));
    mockGetPluginOverride.mockResolvedValue('admin');
    const decision = await evaluate(
      makeCtx('workspace:read', { pluginActionKey: 'crm:read' }),
      fakeTenantDb,
      fakeRedis
    );
    expect(decision.decision).toBe('deny');
  });
});
