// apps/core-api/src/__tests__/workspace/unit/workspace-plugins.unit.test.ts
//
// Unit tests for WorkspacePluginService — Spec 011 Phase 2, FR-023–FR-026.
//
// All DB calls are mocked via vi.fn(). No real Postgres needed.

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { PrismaClient } from '@plexica/database';
import { WorkspacePluginService } from '../../../modules/workspace/workspace-plugin.service.js';
import {
  WorkspaceError,
  WorkspaceErrorCode,
} from '../../../modules/workspace/utils/error-formatter.js';
import type { WorkspacePluginRow } from '../../../modules/workspace/types/workspace-plugin.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<WorkspacePluginRow> = {}): WorkspacePluginRow {
  return {
    workspace_id: 'wsid-0000-0000-0000-000000000001',
    plugin_id: 'plugin-a',
    enabled: true,
    configuration: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const TENANT_CTX = {
  tenantId: 'tttt-0000-0000-0000-000000000001',
  tenantSlug: 'test-tenant',
  schemaName: 'tenant_test_tenant',
};

interface MockDb {
  $queryRaw: Mock;
  $executeRaw: Mock;
}

function createMockDb(queryRawResults: unknown[][] = [], executeRawResults: number[] = []): MockDb {
  const qResults = [...queryRawResults];
  const eResults = [...executeRawResults];

  return {
    $queryRaw: vi.fn().mockImplementation(() => Promise.resolve(qResults.shift() ?? [])),
    $executeRaw: vi.fn().mockImplementation(() => Promise.resolve(eResults.shift() ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// enablePlugin
// ---------------------------------------------------------------------------

describe('WorkspacePluginService.enablePlugin', () => {
  let mockDb: MockDb;
  let service: WorkspacePluginService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new WorkspacePluginService(mockDb as unknown as PrismaClient);
  });

  it('should enable a plugin and return the created row', async () => {
    // Arrange: validateTenantPluginEnabled → INSERT ON CONFLICT RETURNING
    // M3 fix: enablePlugin now uses 2 queries (tenant-check + atomic INSERT),
    // no longer has a separate SELECT-existing check.
    const row = makeRow();
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ enabled: true }]) // tenant plugin OK
      .mockResolvedValueOnce([row]); // INSERT RETURNING result

    // Act
    const result = await service.enablePlugin('wsid-001', 'plugin-a', {}, TENANT_CTX);

    // Assert
    expect(result).toEqual(row);
    expect(mockDb.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('should throw PLUGIN_NOT_TENANT_ENABLED when plugin not in tenant_plugins', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([]); // no tenant_plugin record

    // Act & Assert
    const error = await service
      .enablePlugin('wsid-001', 'plugin-a', {}, TENANT_CTX)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceError);
    expect((error as WorkspaceError).code).toBe(WorkspaceErrorCode.PLUGIN_NOT_TENANT_ENABLED);
    expect((error as WorkspaceError).statusCode).toBe(400);
  });

  it('should throw PLUGIN_NOT_TENANT_ENABLED when plugin is disabled at tenant level', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([{ enabled: false }]);

    // Act & Assert
    const error = await service
      .enablePlugin('wsid-001', 'plugin-a', {}, TENANT_CTX)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceError);
    expect((error as WorkspaceError).code).toBe(WorkspaceErrorCode.PLUGIN_NOT_TENANT_ENABLED);
  });

  it('should throw WORKSPACE_PLUGIN_EXISTS when plugin already enabled', async () => {
    // Arrange: M3 fix — atomic INSERT ON CONFLICT DO NOTHING RETURNING.
    // Empty RETURNING means the row already existed (conflict). No separate SELECT.
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ enabled: true }]) // tenant plugin OK
      .mockResolvedValueOnce([]); // INSERT returns nothing → conflict

    // Act & Assert
    const error = await service
      .enablePlugin('wsid-001', 'plugin-a', {}, TENANT_CTX)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceError);
    expect((error as WorkspaceError).code).toBe(WorkspaceErrorCode.WORKSPACE_PLUGIN_EXISTS);
    expect((error as WorkspaceError).statusCode).toBe(409);
  });

  it('should include workspaceId and pluginId in error details for WORKSPACE_PLUGIN_EXISTS', async () => {
    // Arrange: M3 fix — empty INSERT RETURNING = conflict
    mockDb.$queryRaw.mockResolvedValueOnce([{ enabled: true }]).mockResolvedValueOnce([]);

    // Act & Assert
    const error = await service
      .enablePlugin('wsid-001', 'plugin-a', {}, TENANT_CTX)
      .catch((e: unknown) => e);
    expect((error as WorkspaceError).details).toMatchObject({
      workspaceId: 'wsid-001',
      pluginId: 'plugin-a',
    });
  });

  it('should pass config to the INSERT and return the row with that config', async () => {
    // Arrange: M3 fix — 2 queries (tenant-check + atomic INSERT RETURNING)
    const row = makeRow({ configuration: { theme: 'dark' } });
    mockDb.$queryRaw.mockResolvedValueOnce([{ enabled: true }]).mockResolvedValueOnce([row]);

    // Act
    const result = await service.enablePlugin(
      'wsid-001',
      'plugin-a',
      { theme: 'dark' },
      TENANT_CTX
    );

    // Assert
    expect(result.configuration).toEqual({ theme: 'dark' });
  });
});

// ---------------------------------------------------------------------------
// disablePlugin
// ---------------------------------------------------------------------------

describe('WorkspacePluginService.disablePlugin', () => {
  let mockDb: MockDb;
  let service: WorkspacePluginService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new WorkspacePluginService(mockDb as unknown as PrismaClient);
  });

  it('should disable a plugin successfully when record exists', async () => {
    // Arrange
    mockDb.$executeRaw.mockResolvedValueOnce(1); // 1 row affected

    // Act & Assert
    await expect(
      service.disablePlugin('wsid-001', 'plugin-a', TENANT_CTX)
    ).resolves.toBeUndefined();
  });

  it('should throw WORKSPACE_PLUGIN_NOT_FOUND when no record matches', async () => {
    // Arrange
    mockDb.$executeRaw.mockResolvedValueOnce(0); // 0 rows affected

    // Act & Assert
    const error = await service
      .disablePlugin('wsid-001', 'plugin-a', TENANT_CTX)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceError);
    expect((error as WorkspaceError).code).toBe(WorkspaceErrorCode.WORKSPACE_PLUGIN_NOT_FOUND);
    expect((error as WorkspaceError).statusCode).toBe(404);
  });

  it('should include workspaceId and pluginId in WORKSPACE_PLUGIN_NOT_FOUND details', async () => {
    // Arrange
    mockDb.$executeRaw.mockResolvedValueOnce(0);

    // Act & Assert
    const error = await service
      .disablePlugin('wsid-001', 'plugin-a', TENANT_CTX)
      .catch((e: unknown) => e);
    expect((error as WorkspaceError).details).toMatchObject({
      workspaceId: 'wsid-001',
      pluginId: 'plugin-a',
    });
  });
});

// ---------------------------------------------------------------------------
// updateConfig
// ---------------------------------------------------------------------------

describe('WorkspacePluginService.updateConfig', () => {
  let mockDb: MockDb;
  let service: WorkspacePluginService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new WorkspacePluginService(mockDb as unknown as PrismaClient);
  });

  it('should return the updated row with new configuration', async () => {
    // Arrange
    const row = makeRow({ configuration: { updated: true } });
    mockDb.$queryRaw.mockResolvedValueOnce([row]);

    // Act
    const result = await service.updateConfig(
      'wsid-001',
      'plugin-a',
      { updated: true },
      TENANT_CTX
    );

    // Assert
    expect(result).toEqual(row);
    expect(result.configuration).toEqual({ updated: true });
  });

  it('should throw WORKSPACE_PLUGIN_NOT_FOUND when UPDATE returns no rows', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([]); // nothing updated

    // Act & Assert
    const error = await service
      .updateConfig('wsid-001', 'plugin-a', {}, TENANT_CTX)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceError);
    expect((error as WorkspaceError).code).toBe(WorkspaceErrorCode.WORKSPACE_PLUGIN_NOT_FOUND);
    expect((error as WorkspaceError).statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// listPlugins
// ---------------------------------------------------------------------------

describe('WorkspacePluginService.listPlugins', () => {
  let mockDb: MockDb;
  let service: WorkspacePluginService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new WorkspacePluginService(mockDb as unknown as PrismaClient);
  });

  it('should return all plugin rows', async () => {
    // Arrange
    const rows = [makeRow({ plugin_id: 'plugin-a' }), makeRow({ plugin_id: 'plugin-b' })];
    mockDb.$queryRaw.mockResolvedValueOnce(rows);

    // Act
    const result = await service.listPlugins('wsid-001', TENANT_CTX);

    // Assert
    expect(result).toHaveLength(2);
    expect(result[0].plugin_id).toBe('plugin-a');
    expect(result[1].plugin_id).toBe('plugin-b');
  });

  it('should return empty array when no plugins are configured', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([]);

    // Act
    const result = await service.listPlugins('wsid-001', TENANT_CTX);

    // Assert
    expect(result).toEqual([]);
  });

  it('should include both enabled and disabled plugins', async () => {
    // Arrange
    const rows = [
      makeRow({ plugin_id: 'plugin-a', enabled: true }),
      makeRow({ plugin_id: 'plugin-b', enabled: false }),
    ];
    mockDb.$queryRaw.mockResolvedValueOnce(rows);

    // Act
    const result = await service.listPlugins('wsid-001', TENANT_CTX);

    // Assert
    expect(result.some((r) => r.enabled)).toBe(true);
    expect(result.some((r) => !r.enabled)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cascadeDisableForTenantPlugin
// ---------------------------------------------------------------------------

describe('WorkspacePluginService.cascadeDisableForTenantPlugin', () => {
  let mockDb: MockDb;
  let service: WorkspacePluginService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new WorkspacePluginService(mockDb as unknown as PrismaClient);
  });

  it('should return the number of rows updated', async () => {
    // Arrange
    mockDb.$executeRaw.mockResolvedValueOnce(5);

    // Act
    const count = await service.cascadeDisableForTenantPlugin('plugin-a', TENANT_CTX.tenantId);

    // Assert
    expect(count).toBe(5);
  });

  it('should return 0 when no workspace plugins were enabled', async () => {
    // Arrange
    mockDb.$executeRaw.mockResolvedValueOnce(0);

    // Act
    const count = await service.cascadeDisableForTenantPlugin('plugin-a', TENANT_CTX.tenantId);

    // Assert
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// validateTenantPluginEnabled
// ---------------------------------------------------------------------------

describe('WorkspacePluginService.validateTenantPluginEnabled', () => {
  let mockDb: MockDb;
  let service: WorkspacePluginService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new WorkspacePluginService(mockDb as unknown as PrismaClient);
  });

  it('should resolve when plugin is enabled for the tenant', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([{ enabled: true }]);

    // Act & Assert
    await expect(
      service.validateTenantPluginEnabled('plugin-a', TENANT_CTX.tenantId)
    ).resolves.toBeUndefined();
  });

  it('should throw PLUGIN_NOT_TENANT_ENABLED when plugin is disabled', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([{ enabled: false }]);

    // Act & Assert
    const error = await service
      .validateTenantPluginEnabled('plugin-a', TENANT_CTX.tenantId)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceError);
    expect((error as WorkspaceError).code).toBe(WorkspaceErrorCode.PLUGIN_NOT_TENANT_ENABLED);
    expect((error as WorkspaceError).statusCode).toBe(400);
  });

  it('should throw PLUGIN_NOT_TENANT_ENABLED when plugin is absent from tenant_plugins', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([]);

    // Act & Assert
    const error = await service
      .validateTenantPluginEnabled('plugin-a', TENANT_CTX.tenantId)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceError);
    expect((error as WorkspaceError).code).toBe(WorkspaceErrorCode.PLUGIN_NOT_TENANT_ENABLED);
  });

  it('should include pluginId and tenantId in the error details', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([]);

    // Act & Assert
    const error = await service
      .validateTenantPluginEnabled('plugin-a', TENANT_CTX.tenantId)
      .catch((e: unknown) => e);
    expect((error as WorkspaceError).details).toMatchObject({
      pluginId: 'plugin-a',
      tenantId: TENANT_CTX.tenantId,
    });
  });
});
