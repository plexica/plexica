// apps/core-api/src/__tests__/workspace/unit/plugin-hooks.unit.test.ts
//
// Unit tests for PluginHookService — Spec 011 Phase 3, T011-17.
//
// All DB calls are mocked. HTTP calls use vi.stubGlobal('fetch', ...).
// No real Postgres or network needed.

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { PrismaClient } from '@plexica/database';
import { PluginHookService } from '../../../modules/plugin/plugin-hook.service.js';
import type { TenantContext } from '../../../middleware/tenant-context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_CTX: TenantContext = {
  tenantId: 'tttt-0000-0000-0000-000000000001',
  tenantSlug: 'test-tenant',
  schemaName: 'tenant_test_tenant',
};

const BASE_PAYLOAD = {
  slug: 'ws-test',
  name: 'Test Workspace',
  tenantId: TENANT_CTX.tenantId,
};

/** Build a minimal tenantPlugin record whose manifest declares hook URLs */
function makeTenantPlugin(opts: {
  pluginId: string;
  hookType: 'before_create' | 'created' | 'deleted';
  baseUrl?: string;
}) {
  const base = opts.baseUrl ?? `http://plugin-${opts.pluginId}:8080`;
  return {
    tenantId: TENANT_CTX.tenantId,
    enabled: true,
    plugin: {
      id: opts.pluginId,
      manifest: {
        api: { services: [{ baseUrl: base }] },
        hooks: {
          workspace: {
            [opts.hookType]: `${base}/hooks/workspace/${opts.hookType}`,
          },
        },
      },
    },
  };
}

interface MockPrismaDb {
  tenantPlugin: {
    findMany: Mock;
  };
}

function createMockDb(findManyResult: unknown[] = []): MockPrismaDb {
  return {
    tenantPlugin: {
      findMany: vi.fn().mockResolvedValue(findManyResult),
    },
  };
}

// ---------------------------------------------------------------------------
// runBeforeCreateHooks
// ---------------------------------------------------------------------------

describe('PluginHookService.runBeforeCreateHooks', () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return approved=true when no plugins subscribe to before_create', async () => {
    const mockDb = createMockDb([]);
    const service = new PluginHookService(mockDb as unknown as PrismaClient);

    const result = await service.runBeforeCreateHooks(BASE_PAYLOAD, TENANT_CTX);

    expect(result.approved).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return approved=true when plugin approves the creation', async () => {
    const plugin = makeTenantPlugin({ pluginId: 'plugin-a', hookType: 'before_create' });
    const mockDb = createMockDb([plugin]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ approve: true }),
    });

    const service = new PluginHookService(mockDb as unknown as PrismaClient);
    const result = await service.runBeforeCreateHooks(BASE_PAYLOAD, TENANT_CTX);

    expect(result.approved).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should return approved=false when plugin rejects creation', async () => {
    const plugin = makeTenantPlugin({ pluginId: 'plugin-b', hookType: 'before_create' });
    const mockDb = createMockDb([plugin]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ approve: false, reason: 'policy violation' }),
    });

    const service = new PluginHookService(mockDb as unknown as PrismaClient);
    const result = await service.runBeforeCreateHooks(BASE_PAYLOAD, TENANT_CTX);

    expect(result.approved).toBe(false);
    expect(result.reason).toBe('policy violation');
    expect(result.pluginId).toBe('plugin-b');
  });

  it('should fail-open (approve) when hook times out / throws', async () => {
    const plugin = makeTenantPlugin({ pluginId: 'plugin-c', hookType: 'before_create' });
    const mockDb = createMockDb([plugin]);
    mockFetch.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    const service = new PluginHookService(mockDb as unknown as PrismaClient);
    const result = await service.runBeforeCreateHooks(BASE_PAYLOAD, TENANT_CTX);

    expect(result.approved).toBe(true);
  });

  it('should short-circuit and return first rejection from multiple plugins', async () => {
    const plugin1 = makeTenantPlugin({ pluginId: 'plugin-d', hookType: 'before_create' });
    const plugin2 = makeTenantPlugin({ pluginId: 'plugin-e', hookType: 'before_create' });
    const mockDb = createMockDb([plugin1, plugin2]);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ approve: false, reason: 'blocked by plugin-d' }),
      })
      // plugin2 should NOT be called after plugin1 rejects
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ approve: true }),
      });

    const service = new PluginHookService(mockDb as unknown as PrismaClient);
    const result = await service.runBeforeCreateHooks(BASE_PAYLOAD, TENANT_CTX);

    expect(result.approved).toBe(false);
    expect(result.pluginId).toBe('plugin-d');
    expect(mockFetch).toHaveBeenCalledTimes(1); // second plugin not invoked
  });
});

// ---------------------------------------------------------------------------
// invokeHook — security: URL basePath validation
// ---------------------------------------------------------------------------

describe('PluginHookService.invokeHook', () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should throw when hook URL is outside plugin basePath', async () => {
    const mockDb = createMockDb([]);
    const service = new PluginHookService(mockDb as unknown as PrismaClient);

    const plugin = {
      id: 'plugin-f',
      apiBasePath: 'http://plugin-f:8080',
      hooks: {
        workspace: {
          before_create: 'http://evil.com/steal-data',
        },
      },
    };

    // H3 fix: the error message now uses URL-parsed origin comparison.
    // Origin mismatch message: "does not match plugin basePath origin"
    await expect(
      service.invokeHook(plugin, 'workspace.before_create', BASE_PAYLOAD, 5000)
    ).rejects.toThrow(/basePath/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should throw when hook returns non-2xx status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const mockDb = createMockDb([]);
    const service = new PluginHookService(mockDb as unknown as PrismaClient);

    const plugin = {
      id: 'plugin-g',
      apiBasePath: 'http://plugin-g:8080',
      hooks: {
        workspace: {
          before_create: 'http://plugin-g:8080/hooks/workspace/before_create',
        },
      },
    };

    await expect(
      service.invokeHook(plugin, 'workspace.before_create', BASE_PAYLOAD, 5000)
    ).rejects.toThrow(/500/);
  });

  it('should include X-Tenant-ID header in the request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ approve: true }),
    });

    const mockDb = createMockDb([]);
    const service = new PluginHookService(mockDb as unknown as PrismaClient);

    const plugin = {
      id: 'plugin-h',
      apiBasePath: 'http://plugin-h:8080',
      hooks: {
        workspace: {
          before_create: 'http://plugin-h:8080/hooks/workspace/before_create',
        },
      },
    };

    await service.invokeHook(
      plugin,
      'workspace.before_create',
      { ...BASE_PAYLOAD, tenantId: TENANT_CTX.tenantId },
      5000
    );

    const [, fetchOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = fetchOptions.headers as Record<string, string>;
    expect(headers['X-Tenant-ID']).toBe(TENANT_CTX.tenantId);
  });
});

// ---------------------------------------------------------------------------
// runCreatedHooks / runDeletedHooks — fire-and-forget
// ---------------------------------------------------------------------------

describe('PluginHookService.runCreatedHooks', () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should call hook endpoint and not throw even on failure', async () => {
    const plugin = makeTenantPlugin({ pluginId: 'plugin-i', hookType: 'created' });
    const mockDb = createMockDb([plugin]);
    // Simulate hook failure — should be swallowed
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const service = new PluginHookService(mockDb as unknown as PrismaClient);

    // Should not throw
    expect(() => service.runCreatedHooks('ws-id-001', null, TENANT_CTX)).not.toThrow();

    // Allow fire-and-forget promises to settle
    await new Promise((r) => setTimeout(r, 10));
  });
});

describe('PluginHookService.runDeletedHooks', () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should call hook endpoint and not throw even on failure', async () => {
    const plugin = makeTenantPlugin({ pluginId: 'plugin-j', hookType: 'deleted' });
    const mockDb = createMockDb([plugin]);
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const service = new PluginHookService(mockDb as unknown as PrismaClient);

    // Should not throw
    expect(() => service.runDeletedHooks('ws-id-002', TENANT_CTX)).not.toThrow();

    await new Promise((r) => setTimeout(r, 10));
  });
});

// ---------------------------------------------------------------------------
// getHookSubscribers
// ---------------------------------------------------------------------------

describe('PluginHookService.getHookSubscribers', () => {
  it('should return only plugins that have declared the requested hook', async () => {
    const pluginWithHook = makeTenantPlugin({ pluginId: 'plugin-k', hookType: 'before_create' });
    const pluginWithoutHook = {
      tenantId: TENANT_CTX.tenantId,
      enabled: true,
      plugin: {
        id: 'plugin-l',
        manifest: {
          api: { services: [{ baseUrl: 'http://plugin-l:8080' }] },
          hooks: {
            workspace: {
              // only 'created', not 'before_create'
              created: 'http://plugin-l:8080/hooks/workspace/created',
            },
          },
        },
      },
    };
    const mockDb = createMockDb([pluginWithHook, pluginWithoutHook]);
    const service = new PluginHookService(mockDb as unknown as PrismaClient);

    const subscribers = await service.getHookSubscribers(
      'workspace.before_create',
      TENANT_CTX.tenantId
    );

    expect(subscribers).toHaveLength(1);
    expect(subscribers[0].id).toBe('plugin-k');
  });

  it('should fall back to plugin-id convention when manifest has no api.services', async () => {
    const tp = {
      tenantId: TENANT_CTX.tenantId,
      enabled: true,
      plugin: {
        id: 'plugin-m',
        manifest: {
          // No api.services
          hooks: {
            workspace: {
              before_create: 'http://plugin-plugin-m:8080/hooks/workspace/before_create',
            },
          },
        },
      },
    };
    const mockDb = createMockDb([tp]);
    const service = new PluginHookService(mockDb as unknown as PrismaClient);

    const subscribers = await service.getHookSubscribers(
      'workspace.before_create',
      TENANT_CTX.tenantId
    );

    expect(subscribers[0].apiBasePath).toBe('http://plugin-plugin-m:8080');
  });
});
