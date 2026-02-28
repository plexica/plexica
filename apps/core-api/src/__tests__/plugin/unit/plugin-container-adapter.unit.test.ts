/**
 * T004-08 Unit Tests: ContainerAdapter wiring in PluginLifecycleService
 *
 * Tests use NullContainerAdapter (health always 'healthy') and a mock
 * TenantMigrationService injected via constructor — no live Docker required.
 *
 * Constitution Art. 4.1: ≥80% coverage; Art. 8.2: deterministic, independent tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginLifecycleService } from '../../../services/plugin.service.js';
import { NullContainerAdapter } from '../../../lib/container-adapter.js';
import type { ContainerAdapter } from '../../../lib/container-adapter.js';
import type { TenantMigrationService } from '../../../services/tenant-migration.service.js';
import { db } from '../../../lib/db.js';
import { PluginLifecycleStatus } from '@plexica/database';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../lib/db', () => ({
  db: {
    plugin: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tenantPlugin: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}));

vi.mock('../../../modules/authorization/permission-registration.service', () => ({
  permissionRegistrationService: {
    registerPluginPermissions: vi.fn().mockResolvedValue(undefined),
    removePluginPermissions: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../services/tenant.service', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

vi.mock('../../../services/service-registry.service', () => ({
  ServiceRegistryService: class {
    registerService = vi.fn().mockResolvedValue(undefined);
    deregisterService = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../../../services/dependency-resolution.service', () => ({
  DependencyResolutionService: class {
    registerDependencies = vi.fn().mockResolvedValue(undefined);
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid plugin manifest */
function buildManifest(id = 'test-plugin') {
  return {
    id,
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin for unit testing purposes',
    category: 'analytics',
    metadata: { license: 'MIT', author: { name: 'Tester' } },
  };
}

/** Build a mock TenantMigrationService */
function buildMigrationService(
  overrides?: Partial<{ runPluginMigrations: ReturnType<typeof vi.fn> }>
): TenantMigrationService {
  return {
    runPluginMigrations: vi.fn().mockResolvedValue([]),
    rollbackPluginMigrations: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as TenantMigrationService;
}

// ---------------------------------------------------------------------------
// Tests: activatePlugin (T004-08)
// ---------------------------------------------------------------------------

describe('PluginLifecycleService.activatePlugin (T004-08)', () => {
  let adapter: ContainerAdapter;
  let migrationService: TenantMigrationService;
  let svc: PluginLifecycleService;

  beforeEach(() => {
    vi.resetAllMocks();
    adapter = new NullContainerAdapter();
    migrationService = buildMigrationService();
    svc = new PluginLifecycleService(undefined, adapter, migrationService);
  });

  it('should start container, poll health, transition to ACTIVE, and enable tenantPlugin', async () => {
    const tenantId = 'tenant-1';
    const pluginId = 'test-plugin';
    const manifest = buildManifest(pluginId);

    vi.spyOn(adapter, 'start').mockResolvedValue();
    vi.spyOn(adapter, 'health').mockResolvedValue('healthy');
    vi.spyOn(adapter, 'stop').mockResolvedValue();

    // tenantPlugin.findUnique → installed but not enabled
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: { manifest, lifecycleStatus: PluginLifecycleStatus.INSTALLED } as any,
    } as any);

    // transitionLifecycleStatus(ACTIVE): findUnique → INSTALLED, then update
    vi.mocked(db.plugin.findUnique).mockResolvedValue({
      lifecycleStatus: PluginLifecycleStatus.INSTALLED,
    } as any);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);

    // tenantPlugin.update → returns enabled installation
    vi.mocked(db.tenantPlugin.update).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: true,
      plugin: manifest,
    } as any);

    const result = await svc.activatePlugin(tenantId, pluginId);

    expect(adapter.start).toHaveBeenCalledWith(
      pluginId,
      expect.objectContaining({ image: expect.any(String) })
    );
    expect(adapter.health).toHaveBeenCalledWith(pluginId);
    expect(db.plugin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lifecycleStatus: PluginLifecycleStatus.ACTIVE } })
    );
    expect(db.tenantPlugin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: true } })
    );
    expect(result.enabled).toBe(true);
  });

  it('should stop container and throw when health check times out', async () => {
    const tenantId = 'tenant-1';
    const pluginId = 'test-plugin';
    const manifest = buildManifest(pluginId);

    vi.spyOn(adapter, 'start').mockResolvedValue();
    // Always return 'starting' — health check will time out
    vi.spyOn(adapter, 'health').mockResolvedValue('starting');
    const stopSpy = vi.spyOn(adapter, 'stop').mockResolvedValue();

    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: { manifest, lifecycleStatus: PluginLifecycleStatus.INSTALLED } as any,
    } as any);

    // Pass a very short timeout to keep the test fast (100ms, 50ms interval)
    // We need to call the private method path — override pollHealth via subclass
    const shortTimeoutSvc = new (class extends PluginLifecycleService {
      protected override async pollHealth(): Promise<boolean> {
        return false; // simulate timeout immediately
      }
    })(undefined, adapter, migrationService);

    // tenantPlugin.findUnique for the short-timeout service
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: { manifest, lifecycleStatus: PluginLifecycleStatus.INSTALLED } as any,
    } as any);

    await expect(shortTimeoutSvc.activatePlugin(tenantId, pluginId)).rejects.toThrow(
      `Plugin '${pluginId}' failed health check after enable`
    );
    expect(stopSpy).toHaveBeenCalledWith(pluginId);
  });

  it('should throw if plugin is already active', async () => {
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      enabled: true,
      plugin: { manifest: buildManifest() } as any,
    } as any);

    await expect(svc.activatePlugin('tenant-1', 'test-plugin')).rejects.toThrow('already active');
  });

  it('should throw if plugin is not installed', async () => {
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);

    await expect(svc.activatePlugin('tenant-1', 'test-plugin')).rejects.toThrow('not installed');
  });
});

// ---------------------------------------------------------------------------
// Tests: deactivatePlugin (T004-08)
// ---------------------------------------------------------------------------

describe('PluginLifecycleService.deactivatePlugin (T004-08)', () => {
  let adapter: ContainerAdapter;
  let svc: PluginLifecycleService;

  beforeEach(() => {
    vi.resetAllMocks();
    adapter = new NullContainerAdapter();
    svc = new PluginLifecycleService(undefined, adapter, buildMigrationService());
  });

  it('should transition to DISABLED then stop container and disable tenantPlugin', async () => {
    const tenantId = 'tenant-1';
    const pluginId = 'test-plugin';

    const stopSpy = vi.spyOn(adapter, 'stop').mockResolvedValue();

    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: true,
      plugin: { manifest: buildManifest(pluginId) } as any,
    } as any);

    // deactivatePlugin guard: no other tenants have plugin enabled (0 → will transition & stop)
    vi.mocked(db.tenantPlugin.count).mockResolvedValueOnce(0);

    vi.mocked(db.plugin.findUnique).mockResolvedValue({
      lifecycleStatus: PluginLifecycleStatus.ACTIVE,
    } as any);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);

    vi.mocked(db.tenantPlugin.update).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: buildManifest(pluginId) as any,
    } as any);

    const result = await svc.deactivatePlugin(tenantId, pluginId);

    expect(db.plugin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lifecycleStatus: PluginLifecycleStatus.DISABLED } })
    );
    expect(stopSpy).toHaveBeenCalledWith(pluginId);
    expect(result.enabled).toBe(false);
  });

  it('should throw if plugin is not installed', async () => {
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);

    await expect(svc.deactivatePlugin('tenant-1', 'test-plugin')).rejects.toThrow('not installed');
  });

  it('should throw if plugin is already inactive', async () => {
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      enabled: false,
      plugin: { manifest: buildManifest() } as any,
    } as any);

    await expect(svc.deactivatePlugin('tenant-1', 'test-plugin')).rejects.toThrow(
      'already inactive'
    );
  });

  it('should not rethrow if container stop fails (non-blocking)', async () => {
    const tenantId = 'tenant-1';
    const pluginId = 'test-plugin';

    vi.spyOn(adapter, 'stop').mockRejectedValue(new Error('Docker daemon not running'));

    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: true,
      plugin: { manifest: buildManifest(pluginId) } as any,
    } as any);
    // deactivatePlugin guard: no other tenants have plugin enabled
    vi.mocked(db.tenantPlugin.count).mockResolvedValueOnce(0);
    vi.mocked(db.plugin.findUnique).mockResolvedValue({
      lifecycleStatus: PluginLifecycleStatus.ACTIVE,
    } as any);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);
    vi.mocked(db.tenantPlugin.update).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: buildManifest(pluginId) as any,
    } as any);

    // Should NOT throw — stop failure is non-blocking
    await expect(svc.deactivatePlugin(tenantId, pluginId)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: uninstallPlugin (T004-08)
// ---------------------------------------------------------------------------

describe('PluginLifecycleService.uninstallPlugin (T004-08)', () => {
  let adapter: ContainerAdapter;
  let svc: PluginLifecycleService;

  beforeEach(() => {
    vi.resetAllMocks();
    adapter = new NullContainerAdapter();
    svc = new PluginLifecycleService(undefined, adapter, buildMigrationService());
  });

  it('should transition INSTALLED→UNINSTALLING, remove container, delete row, then UNINSTALLED', async () => {
    const tenantId = 'tenant-1';
    const pluginId = 'test-plugin';

    const removeSpy = vi.spyOn(adapter, 'remove').mockResolvedValue();

    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: { manifest: buildManifest(pluginId) } as any,
    } as any);

    vi.mocked(db.tenant.findUnique).mockResolvedValue(null); // skip permission cleanup

    // transitionLifecycleStatus(UNINSTALLING): INSTALLED → UNINSTALLING
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce({
      lifecycleStatus: PluginLifecycleStatus.INSTALLED,
    } as any);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);

    vi.mocked(db.tenantPlugin.delete).mockResolvedValue({} as any);

    // transitionLifecycleStatus(REGISTERED): UNINSTALLING → REGISTERED (last tenant uninstalled)
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce({
      lifecycleStatus: PluginLifecycleStatus.UNINSTALLING,
    } as any);
    vi.mocked(db.tenantPlugin.count).mockResolvedValue(0); // no remaining installations

    await svc.uninstallPlugin(tenantId, pluginId);

    expect(removeSpy).toHaveBeenCalledWith(pluginId);
    expect(db.tenantPlugin.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId_pluginId: { tenantId, pluginId } } })
    );
    expect(db.plugin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lifecycleStatus: PluginLifecycleStatus.REGISTERED } })
    );
  });

  it('should not rethrow if container remove fails (non-blocking)', async () => {
    const tenantId = 'tenant-1';
    const pluginId = 'test-plugin';

    vi.spyOn(adapter, 'remove').mockRejectedValue(new Error('container not found'));

    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: { manifest: buildManifest(pluginId) } as any,
    } as any);
    vi.mocked(db.tenant.findUnique).mockResolvedValue(null);
    vi.mocked(db.plugin.findUnique)
      .mockResolvedValueOnce({ lifecycleStatus: PluginLifecycleStatus.INSTALLED } as any)
      .mockResolvedValueOnce({ lifecycleStatus: PluginLifecycleStatus.UNINSTALLING } as any);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);
    vi.mocked(db.tenantPlugin.delete).mockResolvedValue({} as any);
    vi.mocked(db.tenantPlugin.count).mockResolvedValue(0); // no remaining installations

    await expect(svc.uninstallPlugin(tenantId, pluginId)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: enableForTenant / disableForTenant (T004-08 / T004-10)
// ---------------------------------------------------------------------------

describe('PluginLifecycleService.enableForTenant (T004-10)', () => {
  let svc: PluginLifecycleService;

  beforeEach(() => {
    vi.resetAllMocks();
    svc = new PluginLifecycleService(
      undefined,
      new NullContainerAdapter(),
      buildMigrationService()
    );
  });

  it('should enable tenantPlugin when plugin is globally ACTIVE', async () => {
    const tenantId = 'tenant-1';
    const pluginId = 'test-plugin';

    vi.mocked(db.plugin.findUnique).mockResolvedValue({
      lifecycleStatus: PluginLifecycleStatus.ACTIVE,
    } as any);
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: { manifest: buildManifest(pluginId) } as any,
    } as any);
    vi.mocked(db.tenantPlugin.update).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: true,
      plugin: buildManifest(pluginId) as any,
    } as any);

    const result = await svc.enableForTenant(tenantId, pluginId);
    expect(result.enabled).toBe(true);
  });

  it('should throw PLUGIN_NOT_GLOBALLY_ACTIVE when plugin is INSTALLED', async () => {
    vi.mocked(db.plugin.findUnique).mockResolvedValue({
      lifecycleStatus: PluginLifecycleStatus.INSTALLED,
    } as any);

    await expect(svc.enableForTenant('tenant-1', 'test-plugin')).rejects.toThrow(
      'must be globally enabled first'
    );
  });

  it('should throw if plugin not found globally', async () => {
    vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

    await expect(svc.enableForTenant('tenant-1', 'test-plugin')).rejects.toThrow('not found');
  });

  it('should throw if plugin not installed for tenant', async () => {
    vi.mocked(db.plugin.findUnique).mockResolvedValue({
      lifecycleStatus: PluginLifecycleStatus.ACTIVE,
    } as any);
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);

    await expect(svc.enableForTenant('tenant-1', 'test-plugin')).rejects.toThrow(
      'not installed for this tenant'
    );
  });

  it('should throw if plugin already enabled for tenant', async () => {
    vi.mocked(db.plugin.findUnique).mockResolvedValue({
      lifecycleStatus: PluginLifecycleStatus.ACTIVE,
    } as any);
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      enabled: true,
      plugin: { manifest: buildManifest() } as any,
    } as any);

    await expect(svc.enableForTenant('tenant-1', 'test-plugin')).rejects.toThrow(
      'already enabled for this tenant'
    );
  });
});

describe('PluginLifecycleService.disableForTenant (T004-10)', () => {
  let svc: PluginLifecycleService;

  beforeEach(() => {
    vi.resetAllMocks();
    svc = new PluginLifecycleService(
      undefined,
      new NullContainerAdapter(),
      buildMigrationService()
    );
  });

  it('should disable tenantPlugin and preserve configuration', async () => {
    const tenantId = 'tenant-1';
    const pluginId = 'test-plugin';
    const config = { someKey: 'someValue' };

    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: true,
      configuration: config,
      plugin: { manifest: buildManifest(pluginId) } as any,
    } as any);
    vi.mocked(db.tenantPlugin.update).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      configuration: config,
      plugin: buildManifest(pluginId) as any,
    } as any);

    const result = await svc.disableForTenant(tenantId, pluginId);
    expect(result.enabled).toBe(false);
    // Configuration should be preserved (not erased)
    expect(db.tenantPlugin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: false } })
    );
    // Verify configuration is NOT in the update payload (preserved as-is)
    const updateCall = vi.mocked(db.tenantPlugin.update).mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('configuration');
  });

  it('should throw if plugin not installed for tenant', async () => {
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);

    await expect(svc.disableForTenant('tenant-1', 'test-plugin')).rejects.toThrow(
      'not installed for this tenant'
    );
  });

  it('should throw if plugin is already disabled', async () => {
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      enabled: false,
      plugin: { manifest: buildManifest() } as any,
    } as any);

    await expect(svc.disableForTenant('tenant-1', 'test-plugin')).rejects.toThrow(
      'already disabled for this tenant'
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: buildContainerConfig (T004-08) — private, tested via activatePlugin
// ---------------------------------------------------------------------------

describe('PluginLifecycleService — buildContainerConfig (T004-08)', () => {
  let adapter: ContainerAdapter;
  let svc: PluginLifecycleService;

  beforeEach(() => {
    vi.resetAllMocks();
    adapter = new NullContainerAdapter();
    svc = new PluginLifecycleService(undefined, adapter, buildMigrationService());
  });

  it('should use manifest.runtime.image when present', async () => {
    const tenantId = 'tenant-1';
    const pluginId = 'test-plugin';
    const manifest = {
      ...buildManifest(pluginId),
      runtime: { image: 'my-registry/test-plugin:2.0.0' },
    };

    const startSpy = vi.spyOn(adapter, 'start').mockResolvedValue();
    vi.spyOn(adapter, 'health').mockResolvedValue('healthy');

    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: { manifest, lifecycleStatus: PluginLifecycleStatus.INSTALLED } as any,
    } as any);
    vi.mocked(db.plugin.findUnique).mockResolvedValue({
      lifecycleStatus: PluginLifecycleStatus.INSTALLED,
    } as any);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);
    vi.mocked(db.tenantPlugin.update).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: true,
      plugin: manifest as any,
    } as any);

    await svc.activatePlugin(tenantId, pluginId);

    expect(startSpy).toHaveBeenCalledWith(
      pluginId,
      expect.objectContaining({ image: 'my-registry/test-plugin:2.0.0' })
    );
  });

  it('should fall back to conventional image name when runtime is absent', async () => {
    const tenantId = 'tenant-1';
    const pluginId = 'test-plugin';
    const manifest = buildManifest(pluginId); // no `runtime` section

    const startSpy = vi.spyOn(adapter, 'start').mockResolvedValue();
    vi.spyOn(adapter, 'health').mockResolvedValue('healthy');

    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: { manifest, lifecycleStatus: PluginLifecycleStatus.INSTALLED } as any,
    } as any);
    vi.mocked(db.plugin.findUnique).mockResolvedValue({
      lifecycleStatus: PluginLifecycleStatus.INSTALLED,
    } as any);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);
    vi.mocked(db.tenantPlugin.update).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: true,
      plugin: manifest as any,
    } as any);

    await svc.activatePlugin(tenantId, pluginId);

    expect(startSpy).toHaveBeenCalledWith(
      pluginId,
      expect.objectContaining({ image: `plexica/plugin-${pluginId}:1.0.0` })
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: NullContainerAdapter (T004-06)
// ---------------------------------------------------------------------------

describe('NullContainerAdapter', () => {
  it('health() always returns "healthy"', async () => {
    const adapter = new NullContainerAdapter();
    await expect(adapter.health('any-plugin')).resolves.toBe('healthy');
  });

  it('start() resolves without side effects', async () => {
    const adapter = new NullContainerAdapter();
    await expect(adapter.start('plugin-id', { image: 'test:latest' })).resolves.toBeUndefined();
  });

  it('stop() resolves without side effects', async () => {
    const adapter = new NullContainerAdapter();
    await expect(adapter.stop('plugin-id')).resolves.toBeUndefined();
  });

  it('remove() resolves without side effects', async () => {
    const adapter = new NullContainerAdapter();
    await expect(adapter.remove('plugin-id')).resolves.toBeUndefined();
  });
});
