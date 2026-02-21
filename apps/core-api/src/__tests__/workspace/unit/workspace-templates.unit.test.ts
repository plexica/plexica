// apps/core-api/src/__tests__/workspace/unit/workspace-templates.unit.test.ts
//
// Unit tests for WorkspaceTemplateService — Spec 011 Phase 2, FR-015–FR-022.
//
// All DB calls are mocked via vi.fn(). No real Postgres needed.

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { PrismaClient } from '@plexica/database';
import { WorkspaceTemplateService } from '../../../modules/workspace/workspace-template.service.js';
import {
  WorkspaceError,
  WorkspaceErrorCode,
} from '../../../modules/workspace/utils/error-formatter.js';
import type {
  TemplateListItem,
  TemplateWithItems,
  TemplateItemRow,
} from '../../../modules/workspace/workspace-template.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplateListItem(overrides: Partial<TemplateListItem> = {}): TemplateListItem {
  return {
    id: 'tmpl-0000-0000-0000-000000000001',
    name: 'Default Template',
    description: 'A test template',
    provided_by_plugin_id: 'plugin-a',
    is_default: false,
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    item_count: 2,
    ...overrides,
  };
}

function makeTemplateItem(overrides: Partial<TemplateItemRow> = {}): TemplateItemRow {
  return {
    id: 'item-0000-0000-0000-000000000001',
    template_id: 'tmpl-0000-0000-0000-000000000001',
    type: 'plugin',
    plugin_id: 'plugin-a',
    page_config: null,
    setting_key: null,
    setting_value: null,
    sort_order: 0,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeTemplateWithItems(overrides: Partial<TemplateWithItems> = {}): TemplateWithItems {
  return {
    id: 'tmpl-0000-0000-0000-000000000001',
    name: 'Default Template',
    description: null,
    provided_by_plugin_id: 'plugin-a',
    is_default: false,
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    items: [],
    ...overrides,
  };
}

const TENANT_ID = 'tttt-0000-0000-0000-000000000001';
const TEMPLATE_ID = 'tmpl-0000-0000-0000-000000000001';
const WORKSPACE_ID = 'wsid-0000-0000-0000-000000000001';

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
// listTemplates
// ---------------------------------------------------------------------------

describe('WorkspaceTemplateService.listTemplates', () => {
  let mockDb: MockDb;
  let service: WorkspaceTemplateService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new WorkspaceTemplateService(mockDb as unknown as PrismaClient);
  });

  it('should return list of templates available to the tenant', async () => {
    // Arrange
    const items = [
      makeTemplateListItem({ id: 'tmpl-001', name: 'Alpha', item_count: BigInt(3) }),
      makeTemplateListItem({ id: 'tmpl-002', name: 'Beta', item_count: BigInt(1) }),
    ];
    mockDb.$queryRaw.mockResolvedValueOnce(items);

    // Act
    const result = await service.listTemplates(TENANT_ID);

    // Assert
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alpha');
    expect(result[1].name).toBe('Beta');
  });

  it('should normalise BigInt item_count to number', async () => {
    // Arrange
    const item = makeTemplateListItem({ item_count: BigInt(7) });
    mockDb.$queryRaw.mockResolvedValueOnce([item]);

    // Act
    const result = await service.listTemplates(TENANT_ID);

    // Assert
    expect(typeof result[0].item_count).toBe('number');
    expect(result[0].item_count).toBe(7);
  });

  it('should return empty array when no templates are available', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([]);

    // Act
    const result = await service.listTemplates(TENANT_ID);

    // Assert
    expect(result).toEqual([]);
  });

  it('should pass tenantId to the query', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([]);

    // Act
    await service.listTemplates(TENANT_ID);

    // Assert: query was called once (tenantId embedded in the SQL template tag)
    expect(mockDb.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getTemplate
// ---------------------------------------------------------------------------

describe('WorkspaceTemplateService.getTemplate', () => {
  let mockDb: MockDb;
  let service: WorkspaceTemplateService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new WorkspaceTemplateService(mockDb as unknown as PrismaClient);
  });

  it('should return template with its items', async () => {
    // Arrange: template row query + items query
    const template = makeTemplateWithItems({
      items: [],
    });
    const { items: _items, ...templateRow } = template; // separate row and items
    const itemRows = [
      makeTemplateItem(),
      makeTemplateItem({
        id: 'item-002',
        type: 'setting',
        plugin_id: null,
        setting_key: 'theme',
        setting_value: 'dark',
      }),
    ];
    mockDb.$queryRaw
      .mockResolvedValueOnce([templateRow]) // template row
      .mockResolvedValueOnce(itemRows); // items

    // Act
    // H2 fix: getTemplate now requires tenantId for tenant scoping
    const result = await service.getTemplate(TEMPLATE_ID, TENANT_ID);

    // Assert
    expect(result.id).toBe(TEMPLATE_ID);
    expect(result.items).toHaveLength(2);
  });

  it('should throw TEMPLATE_NOT_FOUND when template does not exist', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([]); // no template

    // Act & Assert
    const error = await service.getTemplate('nonexistent-id', TENANT_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceError);
    expect((error as WorkspaceError).code).toBe(WorkspaceErrorCode.TEMPLATE_NOT_FOUND);
    expect((error as WorkspaceError).statusCode).toBe(404);
  });

  it('should include templateId in TEMPLATE_NOT_FOUND error details', async () => {
    // Arrange
    mockDb.$queryRaw.mockResolvedValueOnce([]);

    // Act & Assert
    const error = await service.getTemplate('missing-id', TENANT_ID).catch((e: unknown) => e);
    expect((error as WorkspaceError).details).toMatchObject({ templateId: 'missing-id' });
  });

  it('should return empty items array when template has no items', async () => {
    // Arrange
    const { items: _items, ...templateRow } = makeTemplateWithItems();
    mockDb.$queryRaw.mockResolvedValueOnce([templateRow]).mockResolvedValueOnce([]); // no items

    // Act
    const result = await service.getTemplate(TEMPLATE_ID, TENANT_ID);

    // Assert
    expect(result.items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// applyTemplate
// ---------------------------------------------------------------------------

describe('WorkspaceTemplateService.applyTemplate', () => {
  let mockDb: MockDb;
  let service: WorkspaceTemplateService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new WorkspaceTemplateService(mockDb as unknown as PrismaClient);
  });

  it('should throw TEMPLATE_NOT_FOUND when template does not exist in transaction', async () => {
    // Arrange: tx returns no template
    const mockTx: MockDb = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]), // no template
      $executeRaw: vi.fn(),
    };

    // Act & Assert
    await expect(
      service.applyTemplate(
        WORKSPACE_ID,
        'nonexistent',
        TENANT_ID,
        mockTx as unknown as PrismaClient
      )
    ).rejects.toMatchObject({ code: WorkspaceErrorCode.TEMPLATE_NOT_FOUND });
  });

  it('should throw TEMPLATE_PLUGIN_NOT_INSTALLED when plugin item not enabled for tenant', async () => {
    // Arrange
    const templateRow = {
      id: TEMPLATE_ID,
      name: 'Test',
      description: null,
      provided_by_plugin_id: 'plugin-a',
      is_default: false,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    };
    const pluginItem = makeTemplateItem({ type: 'plugin', plugin_id: 'plugin-b' });

    const mockTx: MockDb = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([templateRow]) // template row
        .mockResolvedValueOnce([pluginItem]) // template items
        .mockResolvedValueOnce([]), // tenant_plugins check → not enabled
      $executeRaw: vi.fn(),
    };

    // Act & Assert
    await expect(
      service.applyTemplate(WORKSPACE_ID, TEMPLATE_ID, TENANT_ID, mockTx as unknown as PrismaClient)
    ).rejects.toMatchObject({ code: WorkspaceErrorCode.TEMPLATE_PLUGIN_NOT_INSTALLED });
  });

  it('should apply a plugin item by inserting into workspace_plugins', async () => {
    // Arrange: template with one plugin item, tenant plugin enabled
    const templateRow = {
      id: TEMPLATE_ID,
      name: 'Test',
      description: null,
      provided_by_plugin_id: 'plugin-a',
      is_default: false,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    };
    const pluginItem = makeTemplateItem({ type: 'plugin', plugin_id: 'plugin-a' });

    const mockTx: MockDb = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([templateRow]) // template row
        .mockResolvedValueOnce([pluginItem]) // template items
        .mockResolvedValueOnce([{ enabled: true }]), // tenant_plugins check OK
      $executeRaw: vi.fn().mockResolvedValueOnce(1), // INSERT workspace_plugins
    };

    // Act & Assert (no throw)
    await expect(
      service.applyTemplate(WORKSPACE_ID, TEMPLATE_ID, TENANT_ID, mockTx as unknown as PrismaClient)
    ).resolves.toBeUndefined();

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('should apply a setting item by updating workspaces.settings', async () => {
    // Arrange
    const templateRow = {
      id: TEMPLATE_ID,
      name: 'Test',
      description: null,
      provided_by_plugin_id: 'plugin-a',
      is_default: false,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    };
    const settingItem = makeTemplateItem({
      type: 'setting',
      plugin_id: null,
      setting_key: 'theme',
      setting_value: 'dark',
    });

    const mockTx: MockDb = {
      $queryRaw: vi.fn().mockResolvedValueOnce([templateRow]).mockResolvedValueOnce([settingItem]),
      $executeRaw: vi.fn().mockResolvedValueOnce(1),
    };

    // Act & Assert
    await expect(
      service.applyTemplate(WORKSPACE_ID, TEMPLATE_ID, TENANT_ID, mockTx as unknown as PrismaClient)
    ).resolves.toBeUndefined();

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// registerTemplate / updateTemplate / deleteTemplate (stubs)
// ---------------------------------------------------------------------------

describe('WorkspaceTemplateService Phase 3 — registerTemplate / updateTemplate / deleteTemplate', () => {
  interface MockDbWithTx extends MockDb {
    $transaction: Mock;
  }

  function createMockDbWithTx(): MockDbWithTx {
    const base = createMockDb();
    const txClient: MockDb = createMockDb();
    return {
      ...base,
      $transaction: vi.fn().mockImplementation(async (fn: (tx: MockDb) => Promise<unknown>) => {
        return fn(txClient);
      }),
      // expose txClient via getter for test setup
    } as MockDbWithTx;
  }

  let mockDb: MockDbWithTx;
  let service: WorkspaceTemplateService;

  beforeEach(() => {
    mockDb = createMockDbWithTx();
    service = new WorkspaceTemplateService(mockDb as unknown as PrismaClient);
  });

  it('registerTemplate should throw TEMPLATE_ITEM_LIMIT_EXCEEDED when items > 50', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      type: 'plugin' as const,
      pluginId: `plugin-${i}`,
      sortOrder: i,
    }));
    await expect(
      service.registerTemplate('plugin-a', {
        name: 'too-many-items',
        isDefault: false,
        metadata: {},
        items,
      })
    ).rejects.toThrow(/50/);
  });

  it('updateTemplate should throw TEMPLATE_NOT_FOUND when template does not exist', async () => {
    // Inside the transaction lambda, tx.$queryRaw should return empty
    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: MockDb) => Promise<unknown>) => {
      const tx: MockDb = {
        $queryRaw: vi.fn().mockResolvedValueOnce([]), // not found
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    await expect(
      service.updateTemplate('plugin-a', 'tmpl-does-not-exist', {
        name: 'updated',
        isDefault: false,
        metadata: {},
        items: [],
      })
    ).rejects.toThrow(/not found/i);
  });

  it('updateTemplate should throw INSUFFICIENT_PERMISSIONS when plugin does not own template', async () => {
    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: MockDb) => Promise<unknown>) => {
      const tx: MockDb = {
        $queryRaw: vi.fn().mockResolvedValueOnce([{ provided_by_plugin_id: 'plugin-other' }]),
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    await expect(
      service.updateTemplate('plugin-a', 'tmpl-001', {
        name: 'updated',
        isDefault: false,
        metadata: {},
        items: [],
      })
    ).rejects.toThrow(/does not own/i);
  });

  it('deleteTemplate should throw TEMPLATE_NOT_FOUND when template does not exist', async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.deleteTemplate('plugin-a', 'tmpl-missing')).rejects.toThrow(/not found/i);
  });

  it('deleteTemplate should throw INSUFFICIENT_PERMISSIONS when plugin does not own template', async () => {
    // M1 fix: deleteTemplate now uses atomic DELETE...RETURNING.
    // If DELETE returns empty (plugin doesn't own it), a second SELECT checks existence.
    // 1st query: DELETE WHERE id=... AND provided_by_plugin_id=... → [] (conflict: wrong owner)
    // 2nd query: SELECT id WHERE id=... → [{ id }] (template exists, but owned by another plugin)
    mockDb.$queryRaw
      .mockResolvedValueOnce([]) // DELETE returned nothing (wrong owner)
      .mockResolvedValueOnce([{ id: 'tmpl-001' }]); // template exists

    await expect(service.deleteTemplate('plugin-a', 'tmpl-001')).rejects.toThrow(/does not own/i);
  });
});
