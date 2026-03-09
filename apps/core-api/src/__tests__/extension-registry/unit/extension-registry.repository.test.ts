/**
 * Unit Tests: ExtensionRegistryRepository
 *
 * Spec 013 — Extension Points, T013-20 (Plan §8.1, Art. 4.1, Art. 8.1).
 *
 * Tests all repository methods using a fully mocked Prisma client.
 * No Docker, database, or Redis required — these are pure unit tests.
 *
 * Constitution Compliance:
 *   - Art. 4.1: ≥80% coverage for core module code paths
 *   - Art. 5.2: Tenant isolation guards verified (tenantId enforcement)
 *   - Art. 8.1: Unit, integration, E2E tests required for all features
 *   - Art. 8.2: Deterministic, independent tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock factories BEFORE any imports
// ---------------------------------------------------------------------------

const {
  mockExtensionSlotUpsert,
  mockExtensionSlotFindMany,
  mockExtensionSlotFindFirst,
  mockExtensionSlotUpdateMany,
  mockExtensionContributionUpsert,
  mockExtensionContributionFindMany,
  mockExtensionContributionFindUnique,
  mockExtensionContributionUpdate,
  mockExtensionContributionUpdateMany,
  mockWorkspaceExtensionVisibilityUpsert,
  mockExtensibleEntityUpsert,
  mockExtensibleEntityFindMany,
  mockExtensibleEntityFindFirst,
  mockExtensibleEntityUpdateMany,
  mockDataExtensionUpsert,
  mockDataExtensionFindMany,
  mockDataExtensionUpdateMany,
} = vi.hoisted(() => ({
  mockExtensionSlotUpsert: vi.fn(),
  mockExtensionSlotFindMany: vi.fn(),
  mockExtensionSlotFindFirst: vi.fn(),
  mockExtensionSlotUpdateMany: vi.fn(),
  mockExtensionContributionUpsert: vi.fn(),
  mockExtensionContributionFindMany: vi.fn(),
  mockExtensionContributionFindUnique: vi.fn(),
  mockExtensionContributionUpdate: vi.fn(),
  mockExtensionContributionUpdateMany: vi.fn(),
  mockWorkspaceExtensionVisibilityUpsert: vi.fn(),
  mockExtensibleEntityUpsert: vi.fn(),
  mockExtensibleEntityFindMany: vi.fn(),
  mockExtensibleEntityFindFirst: vi.fn(),
  mockExtensibleEntityUpdateMany: vi.fn(),
  mockDataExtensionUpsert: vi.fn(),
  mockDataExtensionFindMany: vi.fn(),
  mockDataExtensionUpdateMany: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock the Prisma db singleton
// ---------------------------------------------------------------------------

vi.mock('../../../lib/db.js', () => ({
  db: {
    extensionSlot: {
      upsert: mockExtensionSlotUpsert,
      findMany: mockExtensionSlotFindMany,
      findFirst: mockExtensionSlotFindFirst,
      updateMany: mockExtensionSlotUpdateMany,
    },
    extensionContribution: {
      upsert: mockExtensionContributionUpsert,
      findMany: mockExtensionContributionFindMany,
      findUnique: mockExtensionContributionFindUnique,
      update: mockExtensionContributionUpdate,
      updateMany: mockExtensionContributionUpdateMany,
    },
    workspaceExtensionVisibility: {
      upsert: mockWorkspaceExtensionVisibilityUpsert,
    },
    extensibleEntity: {
      upsert: mockExtensibleEntityUpsert,
      findMany: mockExtensibleEntityFindMany,
      findFirst: mockExtensibleEntityFindFirst,
      updateMany: mockExtensibleEntityUpdateMany,
    },
    dataExtension: {
      upsert: mockDataExtensionUpsert,
      findMany: mockDataExtensionFindMany,
      updateMany: mockDataExtensionUpdateMany,
    },
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    child: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Import under test (AFTER mocks)
// ---------------------------------------------------------------------------

import { ExtensionRegistryRepository } from '../../../modules/extension-registry/extension-registry.repository.js';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-abc123';
const PLUGIN_ID = 'plugin-xyz789';
const WORKSPACE_ID = 'ws-111';
const CONTRIBUTION_ID = 'contrib-222';
const SLOT_ID = 'slot-333';

function makeSlot(overrides = {}) {
  return {
    id: 'slot-id-1',
    tenantId: TENANT_ID,
    pluginId: PLUGIN_ID,
    slotId: SLOT_ID,
    label: 'Test Slot',
    type: 'action',
    maxContributions: 10,
    contextSchema: {},
    description: 'A test slot',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeContribution(overrides = {}) {
  return {
    id: CONTRIBUTION_ID,
    tenantId: TENANT_ID,
    contributingPluginId: PLUGIN_ID,
    targetPluginId: 'target-plugin',
    targetSlotId: SLOT_ID,
    componentName: 'MyWidget',
    priority: 100,
    outputSchema: null,
    previewUrl: null,
    description: null,
    validationStatus: 'pending',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExtensionRegistryRepository', () => {
  let repo: ExtensionRegistryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new ExtensionRegistryRepository();
  });

  // ── constructor ─────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should use injected custom db when provided', () => {
      const customDb = {} as never;
      const customRepo = new ExtensionRegistryRepository(customDb);
      expect(customRepo).toBeDefined();
    });

    it('should use singleton db when no custom db provided', () => {
      expect(repo).toBeDefined();
    });
  });

  // ── upsertSlots ─────────────────────────────────────────────────────────────

  describe('upsertSlots', () => {
    it('should upsert each slot with tenantId scoping', async () => {
      mockExtensionSlotUpsert.mockResolvedValue(makeSlot());

      const slots = [
        { slotId: 'slot-a', label: 'Slot A', type: 'action' as const },
        { slotId: 'slot-b', label: 'Slot B', type: 'panel' as const, maxContributions: 5 },
      ];

      await repo.upsertSlots(TENANT_ID, PLUGIN_ID, slots);

      expect(mockExtensionSlotUpsert).toHaveBeenCalledTimes(2);

      // Verify first upsert has correct tenant scoping
      const firstCall = mockExtensionSlotUpsert.mock.calls[0]![0];
      expect(firstCall.where.tenantId_pluginId_slotId).toEqual({
        tenantId: TENANT_ID,
        pluginId: PLUGIN_ID,
        slotId: 'slot-a',
      });
      expect(firstCall.create.tenantId).toBe(TENANT_ID);
      expect(firstCall.create.isActive).toBe(true);
    });

    it('should default maxContributions to 0 when not provided', async () => {
      mockExtensionSlotUpsert.mockResolvedValue(makeSlot());

      await repo.upsertSlots(TENANT_ID, PLUGIN_ID, [
        { slotId: 'slot-a', label: 'A', type: 'form' as const },
      ]);

      const createArg = mockExtensionSlotUpsert.mock.calls[0]![0].create;
      expect(createArg.maxContributions).toBe(0);
    });

    it('should default contextSchema to {} when not provided', async () => {
      mockExtensionSlotUpsert.mockResolvedValue(makeSlot());

      await repo.upsertSlots(TENANT_ID, PLUGIN_ID, [
        { slotId: 'slot-a', label: 'A', type: 'form' as const },
      ]);

      const createArg = mockExtensionSlotUpsert.mock.calls[0]![0].create;
      expect(createArg.contextSchema).toEqual({});
    });

    it('should handle empty slots array without calling upsert', async () => {
      await repo.upsertSlots(TENANT_ID, PLUGIN_ID, []);
      expect(mockExtensionSlotUpsert).not.toHaveBeenCalled();
    });
  });

  // ── getSlots ────────────────────────────────────────────────────────────────

  describe('getSlots', () => {
    it('should query with tenantId and isActive:true', async () => {
      mockExtensionSlotFindMany.mockResolvedValue([makeSlot()]);

      const result = await repo.getSlots(TENANT_ID);

      expect(mockExtensionSlotFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID, isActive: true }),
        })
      );
      expect(result).toHaveLength(1);
    });

    it('should apply pluginId filter when provided', async () => {
      mockExtensionSlotFindMany.mockResolvedValue([]);

      await repo.getSlots(TENANT_ID, { pluginId: PLUGIN_ID });

      const where = mockExtensionSlotFindMany.mock.calls[0]![0].where;
      expect(where.pluginId).toBe(PLUGIN_ID);
    });

    it('should apply type filter when provided', async () => {
      mockExtensionSlotFindMany.mockResolvedValue([]);

      await repo.getSlots(TENANT_ID, { type: 'toolbar' });

      const where = mockExtensionSlotFindMany.mock.calls[0]![0].where;
      expect(where.type).toBe('toolbar');
    });

    it('should use default pagination (page=1, pageSize=50)', async () => {
      mockExtensionSlotFindMany.mockResolvedValue([]);

      await repo.getSlots(TENANT_ID);

      const args = mockExtensionSlotFindMany.mock.calls[0]![0];
      expect(args.take).toBe(50);
      expect(args.skip).toBe(0);
    });

    it('should apply custom pagination', async () => {
      mockExtensionSlotFindMany.mockResolvedValue([]);

      await repo.getSlots(TENANT_ID, undefined, 3, 20);

      const args = mockExtensionSlotFindMany.mock.calls[0]![0];
      expect(args.take).toBe(20);
      expect(args.skip).toBe(40); // (page-1) * pageSize = 2 * 20
    });
  });

  // ── getSlotsByPlugin ─────────────────────────────────────────────────────────

  describe('getSlotsByPlugin', () => {
    it('should filter by tenantId and pluginId', async () => {
      mockExtensionSlotFindMany.mockResolvedValue([makeSlot()]);

      const result = await repo.getSlotsByPlugin(TENANT_ID, PLUGIN_ID);

      const where = mockExtensionSlotFindMany.mock.calls[0]![0].where;
      expect(where.tenantId).toBe(TENANT_ID);
      expect(where.pluginId).toBe(PLUGIN_ID);
      expect(where.isActive).toBe(true);
      expect(result).toHaveLength(1);
    });

    it('should apply default pagination', async () => {
      mockExtensionSlotFindMany.mockResolvedValue([]);

      await repo.getSlotsByPlugin(TENANT_ID, PLUGIN_ID);

      const args = mockExtensionSlotFindMany.mock.calls[0]![0];
      expect(args.take).toBe(50);
      expect(args.skip).toBe(0);
    });
  });

  // ── upsertContributions ──────────────────────────────────────────────────────

  describe('upsertContributions', () => {
    it('should upsert each contribution with tenantId scoping', async () => {
      mockExtensionContributionUpsert.mockResolvedValue(makeContribution());

      const contributions = [
        {
          targetPluginId: 'target-plugin',
          targetSlotId: SLOT_ID,
          componentName: 'Widget',
          priority: 50,
        },
      ];

      await repo.upsertContributions(TENANT_ID, PLUGIN_ID, contributions);

      expect(mockExtensionContributionUpsert).toHaveBeenCalledTimes(1);
      const call = mockExtensionContributionUpsert.mock.calls[0]![0];
      expect(call.where.tenantId_contributingPluginId_targetPluginId_targetSlotId).toEqual({
        tenantId: TENANT_ID,
        contributingPluginId: PLUGIN_ID,
        targetPluginId: 'target-plugin',
        targetSlotId: SLOT_ID,
      });
      expect(call.create.tenantId).toBe(TENANT_ID);
      expect(call.create.validationStatus).toBe('pending');
      expect(call.create.isActive).toBe(true);
    });

    it('should default priority to 100 when not provided', async () => {
      mockExtensionContributionUpsert.mockResolvedValue(makeContribution());

      await repo.upsertContributions(TENANT_ID, PLUGIN_ID, [
        { targetPluginId: 'tp', targetSlotId: 'ts', componentName: 'C' },
      ]);

      const createArg = mockExtensionContributionUpsert.mock.calls[0]![0].create;
      expect(createArg.priority).toBe(100);
    });

    it('should set outputSchema to Prisma.JsonNull when not provided', async () => {
      mockExtensionContributionUpsert.mockResolvedValue(makeContribution());

      await repo.upsertContributions(TENANT_ID, PLUGIN_ID, [
        { targetPluginId: 'tp', targetSlotId: 'ts', componentName: 'C' },
      ]);

      const createArg = mockExtensionContributionUpsert.mock.calls[0]![0].create;
      // Prisma.JsonNull is a special sentinel value
      expect(createArg.outputSchema).toBeDefined();
    });

    it('should set outputSchema to the value when provided', async () => {
      mockExtensionContributionUpsert.mockResolvedValue(makeContribution());

      const schema = { type: 'object' };
      await repo.upsertContributions(TENANT_ID, PLUGIN_ID, [
        { targetPluginId: 'tp', targetSlotId: 'ts', componentName: 'C', outputSchema: schema },
      ]);

      const createArg = mockExtensionContributionUpsert.mock.calls[0]![0].create;
      expect(createArg.outputSchema).toEqual(schema);
    });

    it('should handle empty contributions array', async () => {
      await repo.upsertContributions(TENANT_ID, PLUGIN_ID, []);
      expect(mockExtensionContributionUpsert).not.toHaveBeenCalled();
    });
  });

  // ── getContributions ─────────────────────────────────────────────────────────

  describe('getContributions', () => {
    it('should query with tenantId and isActive:true', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([makeContribution()]);

      const result = await repo.getContributions(TENANT_ID);

      expect(mockExtensionContributionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID, isActive: true }),
        })
      );
      expect(result).toHaveLength(1);
    });

    it('should apply targetPluginId filter', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([]);

      await repo.getContributions(TENANT_ID, { targetPluginId: 'tp' });

      const where = mockExtensionContributionFindMany.mock.calls[0]![0].where;
      expect(where.targetPluginId).toBe('tp');
    });

    it('should apply targetSlotId filter', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([]);

      await repo.getContributions(TENANT_ID, { targetSlotId: 'ts' });

      const where = mockExtensionContributionFindMany.mock.calls[0]![0].where;
      expect(where.targetSlotId).toBe('ts');
    });

    it('should apply legacy slotId filter when targetSlotId not set', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([]);

      await repo.getContributions(TENANT_ID, { slotId: 'legacy-slot' });

      const where = mockExtensionContributionFindMany.mock.calls[0]![0].where;
      expect(where.targetSlotId).toBe('legacy-slot');
    });

    it('should apply pluginId filter as contributingPluginId', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([]);

      await repo.getContributions(TENANT_ID, { pluginId: PLUGIN_ID });

      const where = mockExtensionContributionFindMany.mock.calls[0]![0].where;
      expect(where.contributingPluginId).toBe(PLUGIN_ID);
    });

    it('should filter post-fetch when type filter is provided', async () => {
      const actionContrib = {
        ...makeContribution(),
        targetSlot: { type: 'action', pluginId: 'tp', slotId: 'ts' },
      };
      const panelContrib = {
        ...makeContribution(),
        id: 'contrib-panel',
        targetSlot: { type: 'panel', pluginId: 'tp2', slotId: 'ts2' },
      };

      mockExtensionContributionFindMany.mockResolvedValue([actionContrib, panelContrib]);

      const result = await repo.getContributions(TENANT_ID, { type: 'action' });

      expect(result).toHaveLength(1);
    });

    it('should include target slot in query when type filter is provided', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([]);

      await repo.getContributions(TENANT_ID, { type: 'action' });

      const include = mockExtensionContributionFindMany.mock.calls[0]![0].include;
      expect(include.targetSlot).toBeDefined();
    });

    it('should use default pagination', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([]);

      await repo.getContributions(TENANT_ID);

      const args = mockExtensionContributionFindMany.mock.calls[0]![0];
      expect(args.take).toBe(50);
      expect(args.skip).toBe(0);
    });

    it('should apply workspaceId visibility filter in include', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([]);

      await repo.getContributions(TENANT_ID, { workspaceId: WORKSPACE_ID });

      const include = mockExtensionContributionFindMany.mock.calls[0]![0].include;
      expect(include.visibilityOverrides).toEqual({ where: { workspaceId: WORKSPACE_ID } });
    });
  });

  // ── getContributionsForSlot ──────────────────────────────────────────────────

  describe('getContributionsForSlot', () => {
    it('should fetch contributions and slot metadata in parallel', async () => {
      const rawRow = {
        id: CONTRIBUTION_ID,
        contributingPluginId: PLUGIN_ID,
        targetPluginId: 'tp',
        targetSlotId: SLOT_ID,
        componentName: 'Widget',
        priority: 100,
        validationStatus: 'valid',
        previewUrl: null,
        description: null,
        isActive: true,
        visibilityOverrides: [],
        contributingPlugin: { id: PLUGIN_ID, name: 'My Plugin' },
      };

      mockExtensionContributionFindMany.mockResolvedValue([rawRow]);
      mockExtensionSlotFindFirst.mockResolvedValue(makeSlot({ maxContributions: 5 }));

      const result = await repo.getContributionsForSlot(TENANT_ID, 'tp', SLOT_ID);

      expect(mockExtensionContributionFindMany).toHaveBeenCalledTimes(1);
      expect(mockExtensionSlotFindFirst).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]!.contributingPluginName).toBe('My Plugin');
      expect(result[0]!.isVisible).toBe(true); // default when no override
    });

    it('should apply workspace visibility override when workspaceId provided', async () => {
      const rawRow = {
        id: CONTRIBUTION_ID,
        contributingPluginId: PLUGIN_ID,
        targetPluginId: 'tp',
        targetSlotId: SLOT_ID,
        componentName: 'Widget',
        priority: 100,
        validationStatus: 'valid',
        previewUrl: null,
        description: null,
        isActive: true,
        visibilityOverrides: [{ isVisible: false }],
        contributingPlugin: { id: PLUGIN_ID, name: 'My Plugin' },
      };

      mockExtensionContributionFindMany.mockResolvedValue([rawRow]);
      mockExtensionSlotFindFirst.mockResolvedValue(null);

      const result = await repo.getContributionsForSlot(TENANT_ID, 'tp', SLOT_ID, WORKSPACE_ID);

      expect(result[0]!.isVisible).toBe(false);
    });

    it('should enforce maxContributions cap when slot declares it', async () => {
      const makeRow = (id: string) => ({
        id,
        contributingPluginId: PLUGIN_ID,
        targetPluginId: 'tp',
        targetSlotId: SLOT_ID,
        componentName: 'Widget',
        priority: 100,
        validationStatus: 'valid',
        previewUrl: null,
        description: null,
        isActive: true,
        visibilityOverrides: [],
        contributingPlugin: { id: PLUGIN_ID, name: 'My Plugin' },
      });

      mockExtensionContributionFindMany.mockResolvedValue([
        makeRow('c1'),
        makeRow('c2'),
        makeRow('c3'),
      ]);
      mockExtensionSlotFindFirst.mockResolvedValue({ maxContributions: 2 });

      const result = await repo.getContributionsForSlot(TENANT_ID, 'tp', SLOT_ID);

      expect(result).toHaveLength(2); // capped at maxContributions=2
    });

    it('should return all contributions when maxContributions is 0 (unlimited)', async () => {
      const makeRow = (id: string) => ({
        id,
        contributingPluginId: PLUGIN_ID,
        targetPluginId: 'tp',
        targetSlotId: SLOT_ID,
        componentName: 'Widget',
        priority: 100,
        validationStatus: 'valid',
        previewUrl: null,
        description: null,
        isActive: true,
        visibilityOverrides: [],
        contributingPlugin: { id: PLUGIN_ID, name: 'My Plugin' },
      });

      mockExtensionContributionFindMany.mockResolvedValue([makeRow('c1'), makeRow('c2')]);
      mockExtensionSlotFindFirst.mockResolvedValue({ maxContributions: 0 });

      const result = await repo.getContributionsForSlot(TENANT_ID, 'tp', SLOT_ID);

      expect(result).toHaveLength(2); // unlimited
    });

    it('should fall back to pluginId when contributingPlugin is null', async () => {
      const rawRow = {
        id: CONTRIBUTION_ID,
        contributingPluginId: PLUGIN_ID,
        targetPluginId: 'tp',
        targetSlotId: SLOT_ID,
        componentName: 'Widget',
        priority: 100,
        validationStatus: 'valid',
        previewUrl: null,
        description: null,
        isActive: true,
        visibilityOverrides: [],
        contributingPlugin: null, // null plugin reference
      };

      mockExtensionContributionFindMany.mockResolvedValue([rawRow]);
      mockExtensionSlotFindFirst.mockResolvedValue(null);

      const result = await repo.getContributionsForSlot(TENANT_ID, 'tp', SLOT_ID);

      expect(result[0]!.contributingPluginName).toBe(PLUGIN_ID); // falls back to pluginId
    });

    it('should return empty array when no contributions found', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([]);
      mockExtensionSlotFindFirst.mockResolvedValue(null);

      const result = await repo.getContributionsForSlot(TENANT_ID, 'tp', SLOT_ID);

      expect(result).toEqual([]);
    });
  });

  // ── setVisibility ────────────────────────────────────────────────────────────

  describe('setVisibility', () => {
    it('should upsert visibility when contribution belongs to tenant', async () => {
      mockExtensionContributionFindUnique.mockResolvedValue({
        id: CONTRIBUTION_ID,
        tenantId: TENANT_ID,
      });
      mockWorkspaceExtensionVisibilityUpsert.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        contributionId: CONTRIBUTION_ID,
        isVisible: false,
        updatedAt: new Date('2026-03-09'),
      });

      const result = await repo.setVisibility(TENANT_ID, WORKSPACE_ID, CONTRIBUTION_ID, false);

      expect(result.workspaceId).toBe(WORKSPACE_ID);
      expect(result.contributionId).toBe(CONTRIBUTION_ID);
      expect(result.isVisible).toBe(false);
    });

    it('should throw CONTRIBUTION_NOT_FOUND when contribution does not exist', async () => {
      mockExtensionContributionFindUnique.mockResolvedValue(null);

      await expect(
        repo.setVisibility(TENANT_ID, WORKSPACE_ID, CONTRIBUTION_ID, true)
      ).rejects.toThrow('CONTRIBUTION_NOT_FOUND');
    });

    it('should throw CONTRIBUTION_NOT_FOUND when contribution belongs to different tenant', async () => {
      mockExtensionContributionFindUnique.mockResolvedValue({
        id: CONTRIBUTION_ID,
        tenantId: 'other-tenant', // different tenant!
      });

      await expect(
        repo.setVisibility(TENANT_ID, WORKSPACE_ID, CONTRIBUTION_ID, true)
      ).rejects.toMatchObject({ code: 'CONTRIBUTION_NOT_FOUND' });
    });

    it('should verify the error code is set on the thrown error', async () => {
      mockExtensionContributionFindUnique.mockResolvedValue(null);

      let caughtError: (Error & { code?: string }) | null = null;
      try {
        await repo.setVisibility(TENANT_ID, WORKSPACE_ID, CONTRIBUTION_ID, true);
      } catch (e) {
        caughtError = e as Error & { code?: string };
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError!.code).toBe('CONTRIBUTION_NOT_FOUND');
    });
  });

  // ── upsertEntities ────────────────────────────────────────────────────────────

  describe('upsertEntities', () => {
    it('should upsert each entity with tenantId scoping', async () => {
      mockExtensibleEntityUpsert.mockResolvedValue({});

      const entities = [
        { entityType: 'contact', label: 'Contact', fieldSchema: { type: 'object' } },
        {
          entityType: 'deal',
          label: 'Deal',
          fieldSchema: { type: 'object' },
          description: 'A deal',
        },
      ];

      await repo.upsertEntities(TENANT_ID, PLUGIN_ID, entities);

      expect(mockExtensibleEntityUpsert).toHaveBeenCalledTimes(2);
      const call = mockExtensibleEntityUpsert.mock.calls[0]![0];
      expect(call.where.tenantId_pluginId_entityType).toEqual({
        tenantId: TENANT_ID,
        pluginId: PLUGIN_ID,
        entityType: 'contact',
      });
      expect(call.create.tenantId).toBe(TENANT_ID);
      expect(call.create.isActive).toBe(true);
    });

    it('should default description to null when not provided', async () => {
      mockExtensibleEntityUpsert.mockResolvedValue({});

      await repo.upsertEntities(TENANT_ID, PLUGIN_ID, [
        { entityType: 'contact', label: 'Contact', fieldSchema: {} },
      ]);

      const createArg = mockExtensibleEntityUpsert.mock.calls[0]![0].create;
      expect(createArg.description).toBeNull();
    });

    it('should handle empty entities array', async () => {
      await repo.upsertEntities(TENANT_ID, PLUGIN_ID, []);
      expect(mockExtensibleEntityUpsert).not.toHaveBeenCalled();
    });
  });

  // ── getEntities ───────────────────────────────────────────────────────────────

  describe('getEntities', () => {
    it('should query with tenantId and isActive:true', async () => {
      mockExtensibleEntityFindMany.mockResolvedValue([]);

      await repo.getEntities(TENANT_ID);

      expect(mockExtensibleEntityFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID, isActive: true }),
        })
      );
    });

    it('should apply default pagination', async () => {
      mockExtensibleEntityFindMany.mockResolvedValue([]);

      await repo.getEntities(TENANT_ID);

      const args = mockExtensibleEntityFindMany.mock.calls[0]![0];
      expect(args.take).toBe(50);
      expect(args.skip).toBe(0);
    });
  });

  // ── findEntity ────────────────────────────────────────────────────────────────

  describe('findEntity', () => {
    it('should find entity with tenantId, pluginId, entityType and isActive', async () => {
      const entity = { id: 'e1', tenantId: TENANT_ID, pluginId: PLUGIN_ID, entityType: 'contact' };
      mockExtensibleEntityFindFirst.mockResolvedValue(entity);

      const result = await repo.findEntity(TENANT_ID, PLUGIN_ID, 'contact');

      expect(mockExtensibleEntityFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            pluginId: PLUGIN_ID,
            entityType: 'contact',
            isActive: true,
          }),
        })
      );
      expect(result).toEqual(entity);
    });

    it('should return null when entity not found', async () => {
      mockExtensibleEntityFindFirst.mockResolvedValue(null);

      const result = await repo.findEntity(TENANT_ID, PLUGIN_ID, 'missing');

      expect(result).toBeNull();
    });
  });

  // ── upsertDataExtensions ─────────────────────────────────────────────────────

  describe('upsertDataExtensions', () => {
    it('should upsert each data extension with tenantId scoping', async () => {
      mockDataExtensionUpsert.mockResolvedValue({});

      const extensions = [
        {
          targetPluginId: 'crm',
          targetEntityType: 'contact',
          sidecarUrl: 'https://sidecar.example.com',
          fieldSchema: { type: 'object' },
        },
      ];

      await repo.upsertDataExtensions(TENANT_ID, PLUGIN_ID, extensions);

      expect(mockDataExtensionUpsert).toHaveBeenCalledTimes(1);
      const call = mockDataExtensionUpsert.mock.calls[0]![0];
      expect(call.where.tenantId_contributingPluginId_targetPluginId_targetEntityType).toEqual({
        tenantId: TENANT_ID,
        contributingPluginId: PLUGIN_ID,
        targetPluginId: 'crm',
        targetEntityType: 'contact',
      });
      expect(call.create.tenantId).toBe(TENANT_ID);
      expect(call.create.isActive).toBe(true);
    });

    it('should default description to null when not provided', async () => {
      mockDataExtensionUpsert.mockResolvedValue({});

      await repo.upsertDataExtensions(TENANT_ID, PLUGIN_ID, [
        {
          targetPluginId: 'tp',
          targetEntityType: 'et',
          sidecarUrl: 'https://example.com',
          fieldSchema: {},
        },
      ]);

      const createArg = mockDataExtensionUpsert.mock.calls[0]![0].create;
      expect(createArg.description).toBeNull();
    });

    it('should handle empty extensions array', async () => {
      await repo.upsertDataExtensions(TENANT_ID, PLUGIN_ID, []);
      expect(mockDataExtensionUpsert).not.toHaveBeenCalled();
    });
  });

  // ── getDataExtensions ─────────────────────────────────────────────────────────

  describe('getDataExtensions', () => {
    it('should query with tenantId, targetPluginId, targetEntityType and isActive', async () => {
      mockDataExtensionFindMany.mockResolvedValue([]);

      await repo.getDataExtensions(TENANT_ID, 'crm', 'contact');

      expect(mockDataExtensionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            targetPluginId: 'crm',
            targetEntityType: 'contact',
            isActive: true,
          }),
        })
      );
    });
  });

  // ── deactivateByPlugin ────────────────────────────────────────────────────────

  describe('deactivateByPlugin', () => {
    it('should soft-delete all 4 extension tables for the plugin', async () => {
      mockExtensionSlotUpdateMany.mockResolvedValue({ count: 3 });
      mockExtensionContributionUpdateMany.mockResolvedValue({ count: 5 });
      mockExtensibleEntityUpdateMany.mockResolvedValue({ count: 2 });
      mockDataExtensionUpdateMany.mockResolvedValue({ count: 1 });

      await repo.deactivateByPlugin(TENANT_ID, PLUGIN_ID);

      expect(mockExtensionSlotUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, pluginId: PLUGIN_ID },
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(mockExtensionContributionUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, contributingPluginId: PLUGIN_ID },
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(mockExtensibleEntityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, pluginId: PLUGIN_ID },
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(mockDataExtensionUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, contributingPluginId: PLUGIN_ID },
          data: expect.objectContaining({ isActive: false }),
        })
      );
    });

    it('should issue all 4 updates in parallel (all called exactly once)', async () => {
      mockExtensionSlotUpdateMany.mockResolvedValue({ count: 0 });
      mockExtensionContributionUpdateMany.mockResolvedValue({ count: 0 });
      mockExtensibleEntityUpdateMany.mockResolvedValue({ count: 0 });
      mockDataExtensionUpdateMany.mockResolvedValue({ count: 0 });

      await repo.deactivateByPlugin(TENANT_ID, PLUGIN_ID);

      expect(mockExtensionSlotUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockExtensionContributionUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockExtensibleEntityUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockDataExtensionUpdateMany).toHaveBeenCalledTimes(1);
    });
  });

  // ── reactivateByPlugin ────────────────────────────────────────────────────────

  describe('reactivateByPlugin', () => {
    it('should restore all 4 extension tables for the plugin', async () => {
      mockExtensionSlotUpdateMany.mockResolvedValue({ count: 3 });
      mockExtensionContributionUpdateMany.mockResolvedValue({ count: 5 });
      mockExtensibleEntityUpdateMany.mockResolvedValue({ count: 2 });
      mockDataExtensionUpdateMany.mockResolvedValue({ count: 1 });

      await repo.reactivateByPlugin(TENANT_ID, PLUGIN_ID);

      expect(mockExtensionSlotUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, pluginId: PLUGIN_ID },
          data: expect.objectContaining({ isActive: true }),
        })
      );
      expect(mockExtensionContributionUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, contributingPluginId: PLUGIN_ID },
          data: expect.objectContaining({ isActive: true }),
        })
      );
      expect(mockExtensibleEntityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, pluginId: PLUGIN_ID },
          data: expect.objectContaining({ isActive: true }),
        })
      );
      expect(mockDataExtensionUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, contributingPluginId: PLUGIN_ID },
          data: expect.objectContaining({ isActive: true }),
        })
      );
    });
  });

  // ── getSlotDependents ─────────────────────────────────────────────────────────

  describe('getSlotDependents', () => {
    it('should return dependents when slot exists', async () => {
      mockExtensionSlotFindFirst.mockResolvedValue(makeSlot());
      mockExtensionContributionFindMany.mockResolvedValue([
        {
          contributingPluginId: PLUGIN_ID,
          componentName: 'Widget',
          validationStatus: 'valid',
          isActive: true,
          contributingPlugin: { id: PLUGIN_ID, name: 'My Plugin', lifecycleStatus: 'ACTIVE' },
        },
      ]);

      const result = await repo.getSlotDependents(TENANT_ID, PLUGIN_ID, SLOT_ID);

      expect(result.pluginId).toBe(PLUGIN_ID);
      expect(result.slotId).toBe(SLOT_ID);
      expect(result.dependentCount).toBe(1);
      expect(result.dependents[0]!.pluginName).toBe('My Plugin');
    });

    it('should throw SLOT_NOT_FOUND when slot does not exist', async () => {
      mockExtensionSlotFindFirst.mockResolvedValue(null);

      await expect(
        repo.getSlotDependents(TENANT_ID, PLUGIN_ID, 'missing-slot')
      ).rejects.toMatchObject({ code: 'SLOT_NOT_FOUND' });
    });

    it('should return empty dependents when no contributions for slot', async () => {
      mockExtensionSlotFindFirst.mockResolvedValue(makeSlot());
      mockExtensionContributionFindMany.mockResolvedValue([]);

      const result = await repo.getSlotDependents(TENANT_ID, PLUGIN_ID, SLOT_ID);

      expect(result.dependentCount).toBe(0);
      expect(result.dependents).toEqual([]);
    });

    it('should include tenantId in slot existence check', async () => {
      mockExtensionSlotFindFirst.mockResolvedValue(makeSlot());
      mockExtensionContributionFindMany.mockResolvedValue([]);

      await repo.getSlotDependents(TENANT_ID, PLUGIN_ID, SLOT_ID);

      const slotWhere = mockExtensionSlotFindFirst.mock.calls[0]![0].where;
      expect(slotWhere.tenantId).toBe(TENANT_ID);
    });
  });

  // ── validateContributions ─────────────────────────────────────────────────────

  describe('validateContributions', () => {
    it('should return empty array when no contributions exist', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([]);

      const result = await repo.validateContributions(TENANT_ID, PLUGIN_ID);

      expect(result).toEqual([]);
      expect(mockExtensionSlotFindMany).not.toHaveBeenCalled(); // no slot lookup needed
    });

    it('should mark contributions as valid when target slot exists', async () => {
      const contribution = makeContribution({ targetPluginId: 'tp', targetSlotId: 'ts' });
      mockExtensionContributionFindMany.mockResolvedValue([contribution]);
      mockExtensionSlotFindMany.mockResolvedValue([
        { pluginId: 'tp', slotId: 'ts', type: 'widget' },
      ]);
      mockExtensionContributionUpdate.mockResolvedValue({});

      const result = await repo.validateContributions(TENANT_ID, PLUGIN_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe('valid');
    });

    it('should mark contributions as target_not_found when slot does not exist', async () => {
      const contribution = makeContribution({ targetPluginId: 'tp', targetSlotId: 'missing-slot' });
      mockExtensionContributionFindMany.mockResolvedValue([contribution]);
      mockExtensionSlotFindMany.mockResolvedValue([]); // no matching slot
      mockExtensionContributionUpdate.mockResolvedValue({});

      const result = await repo.validateContributions(TENANT_ID, PLUGIN_ID);

      expect(result[0]!.status).toBe('target_not_found');
      expect(result[0]!.reason).toContain('not found');
    });

    it('should persist validation statuses via update', async () => {
      const contribution = makeContribution({ targetPluginId: 'tp', targetSlotId: 'ts' });
      mockExtensionContributionFindMany.mockResolvedValue([contribution]);
      mockExtensionSlotFindMany.mockResolvedValue([
        { pluginId: 'tp', slotId: 'ts', type: 'widget' },
      ]);
      mockExtensionContributionUpdate.mockResolvedValue({});

      await repo.validateContributions(TENANT_ID, PLUGIN_ID);

      expect(mockExtensionContributionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONTRIBUTION_ID },
          data: expect.objectContaining({ validationStatus: 'valid' }),
        })
      );
    });

    it('should batch-read all target slots in a single query', async () => {
      const contrib1 = makeContribution({ id: 'c1', targetPluginId: 'tp1', targetSlotId: 'ts1' });
      const contrib2 = makeContribution({ id: 'c2', targetPluginId: 'tp2', targetSlotId: 'ts2' });
      mockExtensionContributionFindMany.mockResolvedValue([contrib1, contrib2]);
      mockExtensionSlotFindMany.mockResolvedValue([
        { pluginId: 'tp1', slotId: 'ts1', type: 'widget' },
        { pluginId: 'tp2', slotId: 'ts2', type: 'panel' },
      ]);
      mockExtensionContributionUpdate.mockResolvedValue({});

      await repo.validateContributions(TENANT_ID, PLUGIN_ID);

      // One batch read for slots (H-05 fix: N+1 avoidance)
      expect(mockExtensionSlotFindMany).toHaveBeenCalledTimes(1);
    });

    it('should include tenantId in contributions query', async () => {
      mockExtensionContributionFindMany.mockResolvedValue([]);

      await repo.validateContributions(TENANT_ID, PLUGIN_ID);

      const where = mockExtensionContributionFindMany.mock.calls[0]![0].where;
      expect(where.tenantId).toBe(TENANT_ID);
      expect(where.contributingPluginId).toBe(PLUGIN_ID);
    });
  });

  // ── superAdminListAllSlots ────────────────────────────────────────────────────

  describe('superAdminListAllSlots', () => {
    it('should list slots across all tenants without a tenantId filter', async () => {
      const allSlots = [makeSlot(), makeSlot({ tenantId: 'other-tenant' })];
      mockExtensionSlotFindMany.mockResolvedValue(allSlots);

      const result = await repo.superAdminListAllSlots();

      expect(mockExtensionSlotFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ tenantId: 'asc' }, { pluginId: 'asc' }],
        })
      );
      // No tenantId constraint in where clause
      const args = mockExtensionSlotFindMany.mock.calls[0]![0];
      expect(args.where).toBeUndefined();
      expect(result).toHaveLength(2);
    });

    it('should apply default pagination', async () => {
      mockExtensionSlotFindMany.mockResolvedValue([]);

      await repo.superAdminListAllSlots();

      const args = mockExtensionSlotFindMany.mock.calls[0]![0];
      expect(args.take).toBe(50);
      expect(args.skip).toBe(0);
    });

    it('should apply custom pagination', async () => {
      mockExtensionSlotFindMany.mockResolvedValue([]);

      await repo.superAdminListAllSlots(2, 25);

      const args = mockExtensionSlotFindMany.mock.calls[0]![0];
      expect(args.take).toBe(25);
      expect(args.skip).toBe(25); // (2-1) * 25
    });
  });
});
