/**
 * Unit Tests: ExtensionRegistryService
 *
 * Spec 013 — Extension Points, T013-20 (Plan §8.1, Art. 4.1, Art. 8.1, NFR-013).
 *
 * All dependencies mocked in-memory — no Docker, database, or Redis required.
 * Tests run fast and deterministically.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock factories BEFORE any imports
// ---------------------------------------------------------------------------

const {
  mockUpsertSlots,
  mockUpsertContributions,
  mockUpsertEntities,
  mockUpsertDataExtensions,
  mockGetSlots,
  mockGetSlotsByPlugin,
  mockGetContributions,
  mockGetContributionsForSlot,
  mockSetVisibility,
  mockGetEntities,
  mockGetDataExtensions,
  mockDeactivateByPlugin,
  mockReactivateByPlugin,
  mockGetSlotDependents,
  mockValidateContributions,
  mockRedisGet,
  mockRedisSet,
  mockRedisDel,
  mockRedisKeys,
  mockRedisScan,
  mockLogger,
} = vi.hoisted(() => {
  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);

  return {
    mockUpsertSlots: vi.fn().mockResolvedValue(undefined),
    mockUpsertContributions: vi.fn().mockResolvedValue(undefined),
    mockUpsertEntities: vi.fn().mockResolvedValue(undefined),
    mockUpsertDataExtensions: vi.fn().mockResolvedValue(undefined),
    mockGetSlots: vi.fn().mockResolvedValue([]),
    mockGetSlotsByPlugin: vi.fn().mockResolvedValue([]),
    mockGetContributions: vi.fn().mockResolvedValue([]),
    mockGetContributionsForSlot: vi.fn().mockResolvedValue([]),
    mockSetVisibility: vi.fn().mockResolvedValue({ id: 'vis-1' }),
    mockGetEntities: vi.fn().mockResolvedValue([]),
    mockGetDataExtensions: vi.fn().mockResolvedValue([]),
    mockDeactivateByPlugin: vi.fn().mockResolvedValue(undefined),
    mockReactivateByPlugin: vi.fn().mockResolvedValue(undefined),
    mockGetSlotDependents: vi.fn().mockResolvedValue({ count: 0, plugins: [] }),
    mockValidateContributions: vi.fn().mockResolvedValue([]),
    mockRedisGet: vi.fn(),
    mockRedisSet: vi.fn(),
    mockRedisDel: vi.fn(),
    mockRedisKeys: vi.fn(),
    mockRedisScan: vi.fn(),
    mockLogger: logger,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../modules/extension-registry/extension-registry.repository.js', () => ({
  // Must use a regular function (not an arrow function) so Vitest allows `new` construction
  ExtensionRegistryRepository: vi.fn(function () {
    return {
      upsertSlots: mockUpsertSlots,
      upsertContributions: mockUpsertContributions,
      upsertEntities: mockUpsertEntities,
      upsertDataExtensions: mockUpsertDataExtensions,
      getSlots: mockGetSlots,
      getSlotsByPlugin: mockGetSlotsByPlugin,
      getContributions: mockGetContributions,
      getContributionsForSlot: mockGetContributionsForSlot,
      setVisibility: mockSetVisibility,
      getEntities: mockGetEntities,
      getDataExtensions: mockGetDataExtensions,
      deactivateByPlugin: mockDeactivateByPlugin,
      reactivateByPlugin: mockReactivateByPlugin,
      getSlotDependents: mockGetSlotDependents,
      validateContributions: mockValidateContributions,
    };
  }),
}));

vi.mock('../../../lib/db.js', () => ({ db: {} }));

vi.mock('../../../lib/redis.js', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    keys: mockRedisKeys,
    scan: mockRedisScan,
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: mockLogger,
}));

// ---------------------------------------------------------------------------
// Import under test (AFTER mocks)
// ---------------------------------------------------------------------------

import { ExtensionRegistryService } from '../../../modules/extension-registry/extension-registry.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENABLED_SETTINGS = { extension_points_enabled: true };
const DISABLED_SETTINGS = { extension_points_enabled: false };
const TENANT_ID = 'tenant-aaa';
const PLUGIN_ID = 'plugin-alpha';

const makeSlot = (overrides = {}) => ({
  slotId: 'slot-1',
  label: 'My Slot',
  type: 'action' as const,
  description: 'A test slot',
  ...overrides,
});

const makeContribution = (overrides = {}) => ({
  targetPluginId: PLUGIN_ID,
  targetSlotId: 'slot-1',
  componentName: 'MyWidget',
  priority: 10,
  ...overrides,
});

const makeContributionRow = (overrides = {}) => ({
  id: 'contrib-uuid-1',
  contributingPluginId: 'plugin-beta',
  targetPluginId: PLUGIN_ID,
  targetSlotId: 'slot-1',
  componentName: 'MyWidget',
  priority: 10,
  validationStatus: 'valid' as const,
  previewUrl: null,
  description: null,
  isActive: true,
  isVisible: true,
  ...overrides,
});

function makeService() {
  return new ExtensionRegistryService(undefined, {
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    keys: mockRedisKeys,
    scan: mockRedisScan,
  } as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExtensionRegistryService', () => {
  let service: ExtensionRegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null); // cache miss by default
    mockRedisSet.mockResolvedValue('OK');
    mockRedisDel.mockResolvedValue(1);
    mockRedisKeys.mockResolvedValue([]);
    // SCAN returns [nextCursor, keys]; '0' cursor signals end of iteration (F-005 fix)
    mockRedisScan.mockResolvedValue(['0', []]);
    service = makeService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── assertEnabled (via getSlots) ───────────────────────────────────────────

  describe('feature flag guard', () => {
    it('should throw EXTENSION_POINTS_DISABLED when flag is false', async () => {
      await expect(service.getSlots(TENANT_ID, DISABLED_SETTINGS)).rejects.toThrow(
        'EXTENSION_POINTS_DISABLED'
      );
    });

    it('should throw EXTENSION_POINTS_DISABLED when flag is missing', async () => {
      await expect(service.getSlots(TENANT_ID, {})).rejects.toThrow('EXTENSION_POINTS_DISABLED');
    });

    it('should pass when flag is true', async () => {
      await expect(service.getSlots(TENANT_ID, ENABLED_SETTINGS)).resolves.not.toThrow();
    });

    it('should throw error with code property EXTENSION_POINTS_DISABLED', async () => {
      try {
        await service.getSlots(TENANT_ID, DISABLED_SETTINGS);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as { code: string }).code).toBe('EXTENSION_POINTS_DISABLED');
      }
    });
  });

  // ── syncManifest ──────────────────────────────────────────────────────────

  describe('syncManifest', () => {
    it('should skip silently when feature flag is off', async () => {
      await service.syncManifest(TENANT_ID, DISABLED_SETTINGS, PLUGIN_ID, {
        extensionSlots: [makeSlot()],
      });
      expect(mockUpsertSlots).not.toHaveBeenCalled();
    });

    it('should upsert slots when manifest has extensionSlots', async () => {
      const slots = [makeSlot(), makeSlot({ slotId: 'slot-2' })];
      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, {
        extensionSlots: slots,
      });
      expect(mockUpsertSlots).toHaveBeenCalledWith(TENANT_ID, PLUGIN_ID, slots);
    });

    it('should upsert contributions when manifest has contributions', async () => {
      const contributions = [makeContribution()];
      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, { contributions });
      expect(mockUpsertContributions).toHaveBeenCalledWith(TENANT_ID, PLUGIN_ID, contributions);
    });

    it('should call validateContributions after upserting contributions', async () => {
      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, {
        contributions: [makeContribution()],
      });
      expect(mockValidateContributions).toHaveBeenCalledWith(TENANT_ID, PLUGIN_ID);
    });

    it('should skip upsertSlots when extensionSlots is empty', async () => {
      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, {
        extensionSlots: [],
      });
      expect(mockUpsertSlots).not.toHaveBeenCalled();
    });

    it('should invalidate slot cache after sync', async () => {
      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, {
        extensionSlots: [makeSlot()],
      });
      expect(mockRedisDel).toHaveBeenCalledWith(`ext:slots:${TENANT_ID}`);
    });

    it('should handle full manifest with all 4 arrays', async () => {
      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, {
        extensionSlots: [makeSlot()],
        contributions: [makeContribution()],
        extensibleEntities: [
          { entityType: 'Contact', label: 'Contact', fieldSchema: {}, description: 'A contact' },
        ],
        dataExtensions: [
          {
            targetPluginId: PLUGIN_ID,
            targetEntityType: 'Contact',
            sidecarUrl: 'http://plugin/sidecar',
            fieldSchema: {},
            description: 'Extra fields',
          },
        ],
      });
      expect(mockUpsertSlots).toHaveBeenCalledTimes(1);
      expect(mockUpsertContributions).toHaveBeenCalledTimes(1);
      expect(mockUpsertEntities).toHaveBeenCalledTimes(1);
      expect(mockUpsertDataExtensions).toHaveBeenCalledTimes(1);
    });
  });

  // ── getSlots ──────────────────────────────────────────────────────────────

  describe('getSlots', () => {
    it('should return cached slots on cache hit', async () => {
      const cachedSlots = [{ id: 'slot-1', slotId: 'slot-1' }];
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedSlots));

      const result = await service.getSlots(TENANT_ID, ENABLED_SETTINGS);

      expect(result).toEqual(cachedSlots);
      expect(mockGetSlots).not.toHaveBeenCalled();
    });

    it('should query repo and cache on cache miss', async () => {
      const slots = [{ id: 'slot-1', slotId: 'slot-1' }];
      mockRedisGet.mockResolvedValue(null);
      mockGetSlots.mockResolvedValue(slots);

      const result = await service.getSlots(TENANT_ID, ENABLED_SETTINGS);

      expect(mockGetSlots).toHaveBeenCalledWith(TENANT_ID, undefined);
      expect(mockRedisSet).toHaveBeenCalledWith(
        `ext:slots:${TENANT_ID}`,
        JSON.stringify(slots),
        'EX',
        expect.any(Number)
      );
      expect(result).toEqual(slots);
    });

    it('should cache with TTL between 120 and 150 seconds', async () => {
      mockGetSlots.mockResolvedValue([]);
      await service.getSlots(TENANT_ID, ENABLED_SETTINGS);

      const ttl = mockRedisSet.mock.calls[0][3] as number;
      expect(ttl).toBeGreaterThanOrEqual(120);
      expect(ttl).toBeLessThanOrEqual(150);
    });

    it('should bypass cache when pluginId filter is set', async () => {
      mockGetSlots.mockResolvedValue([]);
      await service.getSlots(TENANT_ID, ENABLED_SETTINGS, { pluginId: PLUGIN_ID });

      expect(mockGetSlots).toHaveBeenCalledWith(TENANT_ID, { pluginId: PLUGIN_ID });
      expect(mockRedisGet).not.toHaveBeenCalled();
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should bypass cache when type filter is set', async () => {
      mockGetSlots.mockResolvedValue([]);
      await service.getSlots(TENANT_ID, ENABLED_SETTINGS, { type: 'panel' });

      expect(mockGetSlots).toHaveBeenCalledWith(TENANT_ID, { type: 'panel' });
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should fall through on corrupt cache JSON', async () => {
      mockRedisGet.mockResolvedValue('NOT VALID JSON{{{');
      mockGetSlots.mockResolvedValue([]);

      await expect(service.getSlots(TENANT_ID, ENABLED_SETTINGS)).resolves.toEqual([]);
      expect(mockGetSlots).toHaveBeenCalled();
    });
  });

  // ── getContributionsForSlot ────────────────────────────────────────────────

  describe('getContributionsForSlot', () => {
    it('should use cache when no workspaceId provided', async () => {
      const rows = [makeContributionRow()];
      mockRedisGet.mockResolvedValue(null);
      mockGetContributionsForSlot.mockResolvedValue(rows);

      await service.getContributionsForSlot(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, 'slot-1');

      expect(mockRedisSet).toHaveBeenCalledWith(
        `ext:contributions:${TENANT_ID}:${PLUGIN_ID}:slot-1`,
        expect.any(String),
        'EX',
        expect.any(Number)
      );
    });

    it('should return cached contributions on hit', async () => {
      const cached = [
        {
          id: 'c-1',
          contributingPluginId: 'plugin-beta',
          contributingPluginName: 'plugin-beta',
          targetPluginId: PLUGIN_ID,
          targetSlotId: 'slot-1',
          componentName: 'Widget',
          priority: 5,
          validationStatus: 'valid',
          isVisible: true,
          isActive: true,
        },
      ];
      mockRedisGet.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getContributionsForSlot(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_ID,
        'slot-1'
      );

      expect(result).toEqual(cached);
      expect(mockGetContributionsForSlot).not.toHaveBeenCalled();
    });

    it('should bypass cache when workspaceId is provided', async () => {
      mockGetContributionsForSlot.mockResolvedValue([]);
      await service.getContributionsForSlot(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_ID,
        'slot-1',
        'workspace-uuid-1'
      );

      expect(mockRedisGet).not.toHaveBeenCalled();
      expect(mockGetContributionsForSlot).toHaveBeenCalledWith(
        TENANT_ID,
        PLUGIN_ID,
        'slot-1',
        'workspace-uuid-1'
      );
    });

    it('should map rows to ResolvedContribution shape', async () => {
      const row = makeContributionRow({ previewUrl: 'http://img.png' });
      mockRedisGet.mockResolvedValue(null);
      mockGetContributionsForSlot.mockResolvedValue([row]);

      const result = await service.getContributionsForSlot(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_ID,
        'slot-1'
      );

      expect(result[0]).toMatchObject({
        id: row.id,
        contributingPluginId: row.contributingPluginId,
        // contributingPluginName falls back to contributingPluginId when not separately resolved
        contributingPluginName: row.contributingPluginId,
        targetPluginId: row.targetPluginId,
        targetSlotId: row.targetSlotId,
        componentName: row.componentName,
        priority: row.priority,
        validationStatus: row.validationStatus,
        previewUrl: 'http://img.png',
        isVisible: true,
        isActive: true,
      });
      // Explicitly verify name is a non-empty string (not undefined)
      expect(typeof result[0].contributingPluginName).toBe('string');
      expect(result[0].contributingPluginName.length).toBeGreaterThan(0);
    });
  });

  // ── setVisibility ─────────────────────────────────────────────────────────

  describe('setVisibility', () => {
    it('should call repo.setVisibility and invalidate cache', async () => {
      await service.setVisibility(TENANT_ID, ENABLED_SETTINGS, 'ws-1', 'contrib-1', false);

      expect(mockSetVisibility).toHaveBeenCalledWith('ws-1', 'contrib-1', false);
      expect(mockRedisDel).toHaveBeenCalledWith(`ext:slots:${TENANT_ID}`);
    });

    it('should return the repo result', async () => {
      const repoResult = { id: 'vis-1', contributionId: 'contrib-1', isVisible: false };
      mockSetVisibility.mockResolvedValue(repoResult);

      const result = await service.setVisibility(
        TENANT_ID,
        ENABLED_SETTINGS,
        'ws-1',
        'contrib-1',
        false
      );

      expect(result).toEqual(repoResult);
    });
  });

  // ── aggregateEntityExtensions (Promise.allSettled) ────────────────────────

  describe('aggregateEntityExtensions', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should return empty fields when no data extensions exist', async () => {
      mockGetDataExtensions.mockResolvedValue([]);

      const result = await service.aggregateEntityExtensions(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_ID,
        'Contact',
        'entity-123'
      );

      expect(result).toEqual({
        pluginId: PLUGIN_ID,
        entityType: 'Contact',
        entityId: 'entity-123',
        fields: {},
        contributors: [],
        warnings: [],
      });
    });

    it('should aggregate fields from two successful sidecar responses', async () => {
      mockGetDataExtensions.mockResolvedValue([
        {
          contributingPluginId: 'plugin-beta',
          sidecarUrl: 'http://beta/sidecar',
        },
        {
          contributingPluginId: 'plugin-gamma',
          sidecarUrl: 'http://gamma/sidecar',
        },
      ]);

      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({ betaField: 'hello' }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({ gammaField: 42 }),
          })
      );

      const result = await service.aggregateEntityExtensions(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_ID,
        'Contact',
        'e-1'
      );

      expect(result.fields).toEqual({ betaField: 'hello', gammaField: 42 });
      expect(result.contributors).toEqual(['plugin-beta', 'plugin-gamma']);
      expect(result.warnings).toHaveLength(0);
    });

    it('should exclude timed-out sidecar and add a warning (Promise.allSettled isolation)', async () => {
      mockGetDataExtensions.mockResolvedValue([
        { contributingPluginId: 'plugin-slow', sidecarUrl: 'http://slow/sidecar' },
        { contributingPluginId: 'plugin-fast', sidecarUrl: 'http://fast/sidecar' },
      ]);

      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementationOnce(() => {
            // Simulate AbortError from timeout
            const err = Object.assign(new Error('The operation was aborted'), {
              name: 'AbortError',
            });
            return Promise.reject(err);
          })
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({ fastField: true }),
          })
      );

      const result = await service.aggregateEntityExtensions(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_ID,
        'Contact',
        'e-1'
      );

      expect(result.fields).toEqual({ fastField: true });
      expect(result.contributors).toEqual(['plugin-fast']);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        pluginId: 'plugin-slow',
        reason: 'timeout',
      });
    });

    it('should add error warning for non-timeout sidecar failure', async () => {
      mockGetDataExtensions.mockResolvedValue([
        { contributingPluginId: 'plugin-broken', sidecarUrl: 'http://broken/sidecar' },
      ]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 500, json: vi.fn().mockResolvedValue({}) })
      );

      const result = await service.aggregateEntityExtensions(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_ID,
        'Contact',
        'e-1'
      );

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        pluginId: 'plugin-broken',
        reason: 'error',
      });
      expect(result.fields).toEqual({});
    });

    it('should not throw even when ALL sidecars fail', async () => {
      mockGetDataExtensions.mockResolvedValue([
        { contributingPluginId: 'p-1', sidecarUrl: 'http://p1/sidecar' },
        { contributingPluginId: 'p-2', sidecarUrl: 'http://p2/sidecar' },
      ]);

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unreachable')));

      await expect(
        service.aggregateEntityExtensions(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, 'Contact', 'e-1')
      ).resolves.toBeDefined();
    });
  });

  // ── onPluginDeactivated / onPluginReactivated ────────────────────────────

  describe('onPluginDeactivated', () => {
    it('should call repo.deactivateByPlugin with tenantId and pluginId', async () => {
      await service.onPluginDeactivated(TENANT_ID, PLUGIN_ID);
      expect(mockDeactivateByPlugin).toHaveBeenCalledWith(TENANT_ID, PLUGIN_ID);
    });
  });

  describe('onPluginReactivated', () => {
    it('should call repo.reactivateByPlugin with tenantId and pluginId', async () => {
      await service.onPluginReactivated(TENANT_ID, PLUGIN_ID);
      expect(mockReactivateByPlugin).toHaveBeenCalledWith(TENANT_ID, PLUGIN_ID);
    });
  });

  // ── getSlots cache invalidation ───────────────────────────────────────────

  describe('cache invalidation', () => {
    it('should delete slots cache key and use SCAN (not KEYS) to remove contribution keys', async () => {
      // Simulate a single SCAN page returning two contribution keys (F-005 fix)
      mockRedisScan.mockResolvedValue([
        '0',
        [`ext:contributions:${TENANT_ID}:p1:s1`, `ext:contributions:${TENANT_ID}:p1:s2`],
      ]);

      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, {
        extensionSlots: [makeSlot()],
      });

      expect(mockRedisDel).toHaveBeenCalledWith(`ext:slots:${TENANT_ID}`);
      // redis.keys() must NOT be called (F-005 fix — use SCAN instead)
      expect(mockRedisKeys).not.toHaveBeenCalled();
      // SCAN was called with the correct pattern
      expect(mockRedisScan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        `ext:contributions:${TENANT_ID}:*`,
        'COUNT',
        100
      );
      // The two discovered keys were deleted
      expect(mockRedisDel).toHaveBeenCalledWith(
        `ext:contributions:${TENANT_ID}:p1:s1`,
        `ext:contributions:${TENANT_ID}:p1:s2`
      );
    });

    it('should iterate multiple SCAN pages until cursor returns "0"', async () => {
      // First SCAN page returns cursor '42' (more pages), second returns '0' (done)
      mockRedisScan
        .mockResolvedValueOnce(['42', [`ext:contributions:${TENANT_ID}:p1:s1`]])
        .mockResolvedValueOnce(['0', [`ext:contributions:${TENANT_ID}:p1:s2`]]);

      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, {
        extensionSlots: [makeSlot()],
      });

      expect(mockRedisScan).toHaveBeenCalledTimes(2);
      expect(mockRedisDel).toHaveBeenCalledWith(`ext:contributions:${TENANT_ID}:p1:s1`);
      expect(mockRedisDel).toHaveBeenCalledWith(`ext:contributions:${TENANT_ID}:p1:s2`);
    });

    it('should not throw if cache del fails (non-fatal)', async () => {
      mockRedisDel.mockRejectedValue(new Error('Redis connection refused'));

      await expect(
        service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID, {
          extensionSlots: [makeSlot()],
        })
      ).resolves.not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // ── validateContributions ─────────────────────────────────────────────────

  describe('validateContributions', () => {
    it('should delegate to repo.validateContributions', async () => {
      const results = [
        {
          contributionId: 'c-1',
          contributingPluginId: 'p-beta',
          targetPluginId: PLUGIN_ID,
          targetSlotId: 'slot-1',
          status: 'valid' as const,
        },
      ];
      mockValidateContributions.mockResolvedValue(results);

      const out = await service.validateContributions(TENANT_ID, ENABLED_SETTINGS, PLUGIN_ID);
      expect(out).toEqual(results);
      expect(mockValidateContributions).toHaveBeenCalledWith(TENANT_ID, PLUGIN_ID);
    });
  });

  // ── getSlotDependents ──────────────────────────────────────────────────────

  describe('getSlotDependents', () => {
    it('should delegate to repo.getSlotDependents', async () => {
      const dependents = { count: 2, plugins: ['plugin-beta', 'plugin-gamma'] };
      mockGetSlotDependents.mockResolvedValue(dependents);

      const result = await service.getSlotDependents(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_ID,
        'slot-1'
      );

      expect(result).toEqual(dependents);
      expect(mockGetSlotDependents).toHaveBeenCalledWith(TENANT_ID, PLUGIN_ID, 'slot-1');
    });
  });
});
