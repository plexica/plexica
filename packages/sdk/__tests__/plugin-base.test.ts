// File: packages/sdk/__tests__/plugin-base.test.ts

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { PlexicaPlugin, WorkspaceAwarePlugin } from '../src/plugin-base';
import type { PluginConfig, PluginContext, ServiceDefinition } from '../src/types';

// ---------------------------------------------------------------------------
// Mock fetch for ApiClient
// ---------------------------------------------------------------------------

function mockFetchSuccess(body: unknown = {}, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status,
    statusText: 'OK',
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Concrete test implementations
// ---------------------------------------------------------------------------

class TestPlugin extends PlexicaPlugin {
  public installCalled = false;
  public activateCalled = false;
  public deactivateCalled = false;
  public uninstallCalled = false;

  getServiceDefinitions(): ServiceDefinition[] {
    return [
      {
        name: 'test.service',
        version: '1.0.0',
        baseUrl: 'http://localhost:4100',
        endpoints: [{ method: 'GET', path: '/items' }],
      },
    ];
  }

  async onInstall(_context: PluginContext): Promise<void> {
    this.installCalled = true;
  }

  async onActivate(_context: PluginContext): Promise<void> {
    this.activateCalled = true;
  }

  async onDeactivate(_context: PluginContext): Promise<void> {
    this.deactivateCalled = true;
  }

  async onUninstall(_context: PluginContext): Promise<void> {
    this.uninstallCalled = true;
  }
}

class NoServicesPlugin extends PlexicaPlugin {
  getServiceDefinitions(): ServiceDefinition[] {
    return [];
  }
}

class TestWorkspacePlugin extends WorkspaceAwarePlugin {
  getServiceDefinitions(): ServiceDefinition[] {
    return [
      {
        name: 'ws.service',
        version: '1.0.0',
        baseUrl: 'http://localhost:4200',
        endpoints: [{ method: 'GET', path: '/data' }],
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfig(overrides?: Partial<PluginConfig>): PluginConfig {
  return {
    pluginId: 'plugin-test',
    name: 'Test Plugin',
    version: '1.0.0',
    apiBaseUrl: 'http://localhost:4000',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlexicaPlugin', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mockFetchSuccess({ success: true, serviceId: 'svc-1' }, 201);
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should create all sub-clients', () => {
      const plugin = new TestPlugin(createConfig());

      expect(plugin.api).toBeDefined();
      expect(plugin.services).toBeDefined();
      expect(plugin.sharedData).toBeDefined();
      expect(plugin.events).toBeNull(); // No EventBus provided
      expect(plugin.config.pluginId).toBe('plugin-test');
    });

    it('should not be started initially', () => {
      const plugin = new TestPlugin(createConfig());
      expect(plugin.isStarted()).toBe(false);
    });
  });

  describe('start()', () => {
    it('should register services and call onActivate', async () => {
      const plugin = new TestPlugin(createConfig());
      await plugin.start('tenant-1', 'user-1');

      expect(plugin.isStarted()).toBe(true);
      expect(plugin.activateCalled).toBe(true);

      // Verify context
      const ctx = plugin.getContext();
      expect(ctx.tenantId).toBe('tenant-1');
      expect(ctx.userId).toBe('user-1');
      expect(ctx.pluginId).toBe('plugin-test');
    });

    it('should throw if started twice', async () => {
      const plugin = new TestPlugin(createConfig());
      await plugin.start('tenant-1');

      await expect(plugin.start('tenant-1')).rejects.toThrow('already started');
    });

    it('should throw if service registration fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'DB down' })),
      } as unknown as Response);

      const plugin = new TestPlugin(createConfig());
      await expect(plugin.start('tenant-1')).rejects.toThrow('Failed to register services');
    });

    it('should skip registration when no services', async () => {
      const fetchMock = mockFetchSuccess();
      globalThis.fetch = fetchMock;

      const plugin = new NoServicesPlugin(createConfig());
      await plugin.start('tenant-1');

      // fetch should NOT have been called (no services to register)
      expect(fetchMock).not.toHaveBeenCalled();
      expect(plugin.isStarted()).toBe(true);
    });
  });

  describe('stop()', () => {
    it('should call onDeactivate and deregister services', async () => {
      // Mock: first call = register (success), second = deregister (success)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: vi.fn().mockResolvedValue(JSON.stringify({ success: true, serviceId: 'svc-1' })),
      } as unknown as Response);

      const plugin = new TestPlugin(createConfig());
      await plugin.start('tenant-1');
      await plugin.stop();

      expect(plugin.deactivateCalled).toBe(true);
      expect(plugin.isStarted()).toBe(false);
    });

    it('should be idempotent when called on a stopped plugin', async () => {
      const plugin = new TestPlugin(createConfig());
      // Calling stop without start should not throw
      await plugin.stop();
      expect(plugin.isStarted()).toBe(false);
    });
  });

  describe('getContext()', () => {
    it('should return a copy of the context', async () => {
      globalThis.fetch = mockFetchSuccess({ success: true, serviceId: 'svc-1' }, 201);

      const plugin = new TestPlugin(createConfig());
      await plugin.start('tenant-1', 'user-1');

      const ctx = plugin.getContext();
      ctx.tenantId = 'modified';

      // Original should be unchanged
      expect(plugin.getContext().tenantId).toBe('tenant-1');
    });
  });

  describe('lifecycle hooks default to no-op', () => {
    it('should not throw when hooks are not overridden', async () => {
      globalThis.fetch = mockFetchSuccess({ success: true, serviceId: 'svc-1' }, 201);

      const plugin = new NoServicesPlugin(createConfig());
      await plugin.start('tenant-1');
      await plugin.stop();
      // Should not throw
    });
  });
});

describe('WorkspaceAwarePlugin', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mockFetchSuccess({ success: true, serviceId: 'svc-1' }, 201);
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  describe('start()', () => {
    it('should set workspaceId in context', async () => {
      const plugin = new TestWorkspacePlugin(createConfig());
      await plugin.start('tenant-1', 'user-1', 'ws-1');

      expect(plugin.workspaceId).toBe('ws-1');

      const ctx = plugin.getContext();
      expect(ctx.workspaceId).toBe('ws-1');
    });

    it('should work without workspaceId', async () => {
      const plugin = new TestWorkspacePlugin(createConfig());
      await plugin.start('tenant-1');

      expect(plugin.workspaceId).toBeUndefined();
    });
  });

  describe('setWorkspaceId()', () => {
    it('should update the workspace context at runtime', async () => {
      const plugin = new TestWorkspacePlugin(createConfig());
      await plugin.start('tenant-1', undefined, 'ws-1');

      plugin.setWorkspaceId('ws-2');
      expect(plugin.workspaceId).toBe('ws-2');
    });
  });
});
