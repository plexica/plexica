// abac-engine.test.ts
// Pure unit tests for the ABAC evaluate() function.
// All external I/O (Redis, DB, logger, config) is mocked.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger before any module under test is imported
vi.mock('../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock config — engine-helpers.ts reads ABAC_CACHE_TTL_SECONDS at call time
vi.mock('../../lib/config.js', () => ({
  config: {
    ABAC_CACHE_TTL_SECONDS: 300,
    ABAC_DECISION_LOG_SAMPLE_RATE: 1.0,
  },
}));

// Mock engine-helpers so we control membership and plugin overrides without Redis/DB
vi.mock('../../modules/abac/engine-helpers.js', () => ({
  getMembership: vi.fn(),
  getPluginActionOverride: vi.fn(),
  membershipCacheKey: vi.fn(),
}));

import { evaluate } from '../../modules/abac/engine.js';
import { getMembership, getPluginActionOverride } from '../../modules/abac/engine-helpers.js';
import { CORE_POLICIES, TENANT_LEVEL_ACTIONS } from '../../modules/abac/policies.js';

import type { AbacContext } from '../../modules/abac/types.js';
import type { CachedMembership } from '../../modules/abac/engine-helpers.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const mockGetMembership = vi.mocked(getMembership);
const mockGetPluginOverride = vi.mocked(getPluginActionOverride);

// Dummy redis & tenantDb — never actually called thanks to mocks
const fakeRedis = {} as Parameters<typeof evaluate>[2];
const fakeTenantDb = {};

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

const nonMember: CachedMembership = { role: null, isTenantAdmin: false };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetMembership.mockReset();
  mockGetPluginOverride.mockReset();
  // Default: no plugin override
  mockGetPluginOverride.mockResolvedValue(null);
});

// ===========================================================================
// Tests
// ===========================================================================

describe('ABAC evaluate() — tenant admin bypass', () => {
  it('allows all 17 core actions when isTenantAdmin=true', async () => {
    for (const policy of CORE_POLICIES) {
      const ctx = makeCtx(policy.action, { isTenantAdmin: true });
      const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
      expect(decision.decision).toBe('allow');
      expect(decision.allowed).toBe(true);
    }
  });

  it('reason string is "tenant admin bypass"', async () => {
    const ctx = makeCtx('workspace:read', { isTenantAdmin: true });
    const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
    expect(decision.reason).toBe('tenant admin bypass');
  });
});

describe('ABAC evaluate() — tenant-level actions for non-admin', () => {
  it('denies every tenant-level action when isTenantAdmin=false', async () => {
    for (const action of TENANT_LEVEL_ACTIONS) {
      const ctx = makeCtx(action, { isTenantAdmin: false });
      const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
      expect(decision.decision).toBe('deny');
    }
  });
});

describe('ABAC evaluate() — non-member', () => {
  beforeEach(() => {
    mockGetMembership.mockResolvedValue(nonMember);
  });

  it('denies workspace:read for a non-member', async () => {
    const ctx = makeCtx('workspace:read');
    const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
    expect(decision.decision).toBe('deny');
    expect(decision.reason).toContain('not a workspace member');
  });
});

describe('ABAC evaluate() — admin role', () => {
  beforeEach(() => {
    mockGetMembership.mockResolvedValue(memberOf('admin'));
  });

  it('allows all 17 core actions', async () => {
    for (const policy of CORE_POLICIES) {
      // Skip tenant-level actions — they are handled before membership lookup
      if (TENANT_LEVEL_ACTIONS.has(policy.action)) continue;
      const ctx = makeCtx(policy.action);
      const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
      expect(decision.decision, `action=${policy.action}`).toBe('allow');
    }
  });
});

describe('ABAC evaluate() — member role', () => {
  beforeEach(() => {
    mockGetMembership.mockResolvedValue(memberOf('member'));
  });

  const memberAllowed = new Set([
    'workspace:read',
    'member:list',
    'content:read',
    'content:create',
    'content:update',
  ]);

  for (const policy of CORE_POLICIES) {
    if (TENANT_LEVEL_ACTIONS.has(policy.action)) continue;
    const expectedDecision = memberAllowed.has(policy.action) ? 'allow' : 'deny';
    it(`action="${policy.action}" → ${expectedDecision}`, async () => {
      const ctx = makeCtx(policy.action);
      const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
      expect(decision.decision).toBe(expectedDecision);
    });
  }
});

describe('ABAC evaluate() — viewer role', () => {
  beforeEach(() => {
    mockGetMembership.mockResolvedValue(memberOf('viewer'));
  });

  const viewerAllowed = new Set(['workspace:read', 'member:list', 'content:read']);

  for (const policy of CORE_POLICIES) {
    if (TENANT_LEVEL_ACTIONS.has(policy.action)) continue;
    const expectedDecision = viewerAllowed.has(policy.action) ? 'allow' : 'deny';
    it(`action="${policy.action}" → ${expectedDecision}`, async () => {
      const ctx = makeCtx(policy.action);
      const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
      expect(decision.decision).toBe(expectedDecision);
    });
  }
});

describe('ABAC evaluate() — unknown action', () => {
  it('denies an action not in the policy registry', async () => {
    mockGetMembership.mockResolvedValue(memberOf('admin'));
    const ctx = makeCtx('not:a:real:action');
    const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
    expect(decision.decision).toBe('deny');
    expect(decision.reason).toContain('unknown action');
  });
});

describe('ABAC evaluate() — plugin action override', () => {
  it('override changes required role: viewer doing member:invite allowed when override=viewer', async () => {
    mockGetMembership.mockResolvedValue(memberOf('viewer'));
    // Override: member:invite now only needs viewer
    mockGetPluginOverride.mockResolvedValue('viewer');
    const ctx = makeCtx('member:invite', { pluginActionKey: 'crm:invite' });
    const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
    expect(decision.decision).toBe('allow');
  });

  it('override raises required role: admin doing workspace:read denied when override=admin', async () => {
    // member doing workspace:read (normally viewer required) — override sets required=admin
    mockGetMembership.mockResolvedValue(memberOf('member'));
    mockGetPluginOverride.mockResolvedValue('admin');
    const ctx = makeCtx('workspace:read', { pluginActionKey: 'crm:read' });
    const decision = await evaluate(ctx, fakeTenantDb, fakeRedis);
    expect(decision.decision).toBe('deny');
  });
});
