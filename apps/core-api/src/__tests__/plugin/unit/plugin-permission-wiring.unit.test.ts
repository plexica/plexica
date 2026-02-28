// T004-05: Permission registration wiring in PluginLifecycleService.installPlugin()
//
// Tests:
//   1. registerPluginPermissions is called with correctly mapped args after install
//   2. registerPluginPermissions is NOT called when manifest has no permissions
//   3. On PERMISSION_KEY_CONFLICT, tenantPlugin row is deleted AND lifecycleStatus
//      is reset to REGISTERED (T004-05 requirement)
//
// Constitution compliance:
//   Article 5.1 / 5.3: Permission keys validated via PermissionRegistrationService
//   Article 1.2: Tenant isolation enforced (per-tenant schema name)
//   Article 8: Unit test using vi.mock, isolated, deterministic, AAA pattern

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginLifecycleService } from '../../../services/plugin.service.js';
import { db } from '../../../lib/db.js';
import { PluginStatus, PluginLifecycleStatus } from '@plexica/database';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/db', () => ({
  db: {
    plugin: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    tenantPlugin: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
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

vi.mock('../../../services/service-registry.service', () => ({
  ServiceRegistryService: class {
    registerService = vi.fn().mockResolvedValue({ id: 'service-1' });
  },
}));

vi.mock('../../../services/dependency-resolution.service', () => ({
  DependencyResolutionService: class {
    registerDependencies = vi.fn().mockResolvedValue(null);
  },
}));

vi.mock('../../../lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../../modules/authorization/permission-registration.service', () => ({
  permissionRegistrationService: {
    registerPluginPermissions: vi.fn(),
  },
}));

vi.mock('../../../services/tenant.service', () => ({
  tenantService: {
    getSchemaName: vi.fn((slug: string) => `tenant_${slug.replace(/-/g, '_')}`),
  },
}));

import { permissionRegistrationService } from '../../../modules/authorization/permission-registration.service.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-perm-test';
const PLUGIN_ID = 'perm-plugin';
const TENANT_SLUG = 'perm-test';
const SCHEMA_NAME = 'tenant_perm_test';

const manifestWithPerms = {
  id: PLUGIN_ID,
  name: 'Perm Plugin',
  version: '1.0.0',
  description: 'Plugin with permissions for testing',
  category: 'analytics',
  metadata: {
    license: 'MIT',
    author: { name: 'Author', email: 'a@example.com' },
  },
  permissions: [
    { resource: 'reports', action: 'read', description: 'Read reports' },
    { resource: 'reports', action: 'write', description: 'Write reports' },
  ],
};

const mockPlugin = {
  id: PLUGIN_ID,
  status: PluginStatus.PUBLISHED,
  manifest: manifestWithPerms,
  lifecycleStatus: PluginLifecycleStatus.REGISTERED,
};

const mockInstallation = {
  id: 'installation-perm-1',
  tenantId: TENANT_ID,
  pluginId: PLUGIN_ID,
  enabled: false,
  configuration: {},
  plugin: mockPlugin,
  tenant: { id: TENANT_ID, slug: TENANT_SLUG },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PluginLifecycleService — permission registration wiring (T004-05)', () => {
  let lifecycleService: PluginLifecycleService;

  beforeEach(() => {
    vi.resetAllMocks(); // Reset queued mockResolvedValueOnce values AND call history
    lifecycleService = new PluginLifecycleService();
  });

  it('should call registerPluginPermissions with correctly mapped args after successful install', async () => {
    // Arrange
    // Call 1: registry.getPlugin() — full plugin object
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce(mockPlugin as any);
    // Call 2: transitionLifecycleStatus(INSTALLING) — select lifecycleStatus
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce({
      lifecycleStatus: PluginLifecycleStatus.REGISTERED,
    } as any);
    // Call 3: transitionLifecycleStatus(INSTALLED) after success — select lifecycleStatus
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce({
      lifecycleStatus: PluginLifecycleStatus.INSTALLING,
    } as any);
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ tenantPlugin: { create: vi.fn().mockResolvedValue(mockInstallation) } })
    );
    vi.mocked(db.tenant.findUnique).mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG } as any);
    vi.mocked(permissionRegistrationService.registerPluginPermissions).mockResolvedValue(undefined);

    // Act
    await lifecycleService.installPlugin(TENANT_ID, PLUGIN_ID);

    // Assert: called with tenantId, schemaName, pluginId, and mapped PluginPermissionInput[]
    expect(permissionRegistrationService.registerPluginPermissions).toHaveBeenCalledOnce();
    expect(permissionRegistrationService.registerPluginPermissions).toHaveBeenCalledWith(
      TENANT_ID,
      SCHEMA_NAME,
      PLUGIN_ID,
      [
        { key: 'reports:read', name: 'reports read', description: 'Read reports' },
        { key: 'reports:write', name: 'reports write', description: 'Write reports' },
      ]
    );
  });

  it('should NOT call registerPluginPermissions when manifest has no permissions', async () => {
    // Arrange: manifest with no permissions field
    const pluginNoPerms = {
      ...mockPlugin,
      manifest: { ...manifestWithPerms, permissions: undefined },
    };
    // Call 1: registry.getPlugin()
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce(pluginNoPerms as any);
    // Call 2: transitionLifecycleStatus(INSTALLING)
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce({
      lifecycleStatus: PluginLifecycleStatus.REGISTERED,
    } as any);
    // Call 3: transitionLifecycleStatus(INSTALLED)
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce({
      lifecycleStatus: PluginLifecycleStatus.INSTALLING,
    } as any);
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ tenantPlugin: { create: vi.fn().mockResolvedValue(mockInstallation) } })
    );

    // Act
    await lifecycleService.installPlugin(TENANT_ID, PLUGIN_ID);

    // Assert
    expect(permissionRegistrationService.registerPluginPermissions).not.toHaveBeenCalled();
  });

  it('should NOT call registerPluginPermissions when manifest has empty permissions array', async () => {
    // Arrange: manifest with empty permissions array
    const pluginEmptyPerms = {
      ...mockPlugin,
      manifest: { ...manifestWithPerms, permissions: [] },
    };
    // Call 1: registry.getPlugin()
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce(pluginEmptyPerms as any);
    // Call 2: transitionLifecycleStatus(INSTALLING)
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce({
      lifecycleStatus: PluginLifecycleStatus.REGISTERED,
    } as any);
    // Call 3: transitionLifecycleStatus(INSTALLED)
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce({
      lifecycleStatus: PluginLifecycleStatus.INSTALLING,
    } as any);
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ tenantPlugin: { create: vi.fn().mockResolvedValue(mockInstallation) } })
    );

    // Act
    await lifecycleService.installPlugin(TENANT_ID, PLUGIN_ID);

    // Assert
    expect(permissionRegistrationService.registerPluginPermissions).not.toHaveBeenCalled();
  });

  it('should rollback tenantPlugin row and reset lifecycleStatus to REGISTERED on PERMISSION_KEY_CONFLICT', async () => {
    // Arrange
    // Call 1: registry.getPlugin()
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce(mockPlugin as any);
    // Call 2: transitionLifecycleStatus(INSTALLING)
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce({
      lifecycleStatus: PluginLifecycleStatus.REGISTERED,
    } as any);
    // Call 3: transitionLifecycleStatus(INSTALLED) after transaction success
    vi.mocked(db.plugin.findUnique).mockResolvedValueOnce({
      lifecycleStatus: PluginLifecycleStatus.INSTALLING,
    } as any);
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ tenantPlugin: { create: vi.fn().mockResolvedValue(mockInstallation) } })
    );
    vi.mocked(db.tenant.findUnique).mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG } as any);
    vi.mocked(db.tenantPlugin.delete).mockResolvedValue({} as any);

    const conflictError = Object.assign(
      new Error(
        'Permission key "reports:read" is already registered by core. Plugin installation aborted.'
      ),
      { code: 'PERMISSION_KEY_CONFLICT', key: 'reports:read', existingOwner: 'core' }
    );
    vi.mocked(permissionRegistrationService.registerPluginPermissions).mockRejectedValue(
      conflictError
    );

    // Act
    await expect(lifecycleService.installPlugin(TENANT_ID, PLUGIN_ID)).rejects.toThrow(
      'Permission key "reports:read" is already registered by core'
    );

    // Assert: tenantPlugin row removed (rollback of the DB installation)
    expect(db.tenantPlugin.delete).toHaveBeenCalledWith({
      where: { tenantId_pluginId: { tenantId: TENANT_ID, pluginId: PLUGIN_ID } },
    });

    // Assert: lifecycleStatus reset back to REGISTERED (T004-05 key requirement)
    expect(db.plugin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLUGIN_ID },
        data: { lifecycleStatus: PluginLifecycleStatus.REGISTERED },
      })
    );
  });
});
