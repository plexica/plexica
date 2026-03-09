/**
 * Integration Tests: Extension Registry — Full Workflow Scenarios
 *
 * Spec 013 — Extension Points, T013-25 (Plan §8.5, Art. 4.1, Art. 8.1).
 *
 * NOTE (M-04): This file was previously located in the e2e/ folder but was
 * mislabelled — it uses Vitest mocked service layers, NOT a real running
 * process or Playwright. Renamed and moved to integration/ to correctly
 * reflect its nature (mocked unit-integration tests).
 *
 * Tests full workflow scenarios using mocked service layers (Vitest-based,
 * not Playwright) to keep execution within the < 5s per test budget.
 *
 * Scenarios:
 *   1.  Install → Activate → Query slots (happy path, FR-001..FR-005)
 *   2.  Workspace visibility toggle round-trip (FR-022, FR-025)
 *   3.  Plugin deactivation cascades to extension records (FR-028)
 *   4.  Plugin re-activation restores extension records
 *   5.  Orphaned contribution (contributing plugin uninstalled — Edge Case #2)
 *   6.  Type mismatch: contribution targets a non-existent slot type (Edge Case #7)
 *   7.  Feature flag disabled — all queries fail gracefully with EXTENSION_POINTS_DISABLED
 *
 * Constitution Compliance:
 *   - Art. 5.2: Tenant isolation maintained throughout workflows
 *   - Art. 6.1: Operational errors return typed codes, not stack traces
 *   - Art. 4.1: ≥80% coverage for Spec 013 code paths
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock factories
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
} = vi.hoisted(() => ({
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
}));

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

// ---------------------------------------------------------------------------
// Import service under test (after mocks)
// ---------------------------------------------------------------------------

import { ExtensionRegistryService } from '../../../modules/extension-registry/extension-registry.service.js';
import type {
  ExtensionSlotDeclaration,
  ContributionDeclaration,
  ExtensibleEntityDeclaration,
} from '@plexica/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-e2e-test';
const PLUGIN_HOST = 'plugin-host';
const PLUGIN_CONTRIB = 'plugin-contributor';
const WORKSPACE_ID = '11111111-2222-3333-4444-555555555555';
const CONTRIBUTION_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';
const ENABLED_SETTINGS = { extension_points_enabled: true };
const DISABLED_SETTINGS = { extension_points_enabled: false };

const SLOT_DECLARATION: ExtensionSlotDeclaration = {
  slotId: 'toolbar-actions',
  label: 'Toolbar Actions',
  type: 'toolbar',
  maxContributions: 5,
};

const CONTRIBUTION_DECLARATION: ContributionDeclaration = {
  targetPluginId: PLUGIN_HOST,
  targetSlotId: 'toolbar-actions',
  componentName: 'ContribButton',
  priority: 10,
};

const ENTITY_DECLARATION: ExtensibleEntityDeclaration = {
  entityType: 'contact',
  label: 'Contact',
  fieldSchema: { type: 'object', properties: {} },
};

const DB_SLOT = {
  id: 'slot-e2e-1',
  tenantId: TENANT_ID,
  pluginId: PLUGIN_HOST,
  slotId: 'toolbar-actions',
  slotType: 'toolbar',
  label: 'Toolbar Actions',
  isActive: true,
};

const DB_CONTRIBUTION = {
  id: CONTRIBUTION_ID,
  contributingPluginId: PLUGIN_CONTRIB,
  targetPluginId: PLUGIN_HOST,
  targetSlotId: 'toolbar-actions',
  componentName: 'ContribButton',
  priority: 10,
  validationStatus: 'valid' as const,
  previewUrl: null,
  description: null,
  isActive: true,
  isVisible: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRedis(overrides?: Partial<Record<string, ReturnType<typeof vi.fn>>>) {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    // C2 fix: scan() is required by invalidateSlotCache() (F-005 SCAN migration).
    // Default returns a terminal cursor '0' with no matching keys.
    scan: vi.fn().mockResolvedValue(['0', []]),
    ...overrides,
  };
}

function makeService() {
  const fakeLogger = {
    child: vi.fn().mockReturnThis(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  };
  return new ExtensionRegistryService(undefined, makeRedis() as never, fakeLogger as never);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('Extension Registry — Integration Workflow Scenarios', () => {
  let service: ExtensionRegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = makeService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Scenario 1: Install → Activate → Query slots ───────────────────────────

  describe('Scenario 1: Plugin install → activate → query slots (FR-001..FR-005)', () => {
    it('1a — syncManifest upserts slots, contributions, and entities from manifest', async () => {
      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_HOST, {
        extensionSlots: [SLOT_DECLARATION],
        contributions: [],
        extensibleEntities: [ENTITY_DECLARATION],
      });

      expect(mockUpsertSlots).toHaveBeenCalledWith(TENANT_ID, PLUGIN_HOST, [SLOT_DECLARATION]);
      expect(mockUpsertEntities).toHaveBeenCalledWith(TENANT_ID, PLUGIN_HOST, [ENTITY_DECLARATION]);
      // No contributions — not called
      expect(mockUpsertContributions).not.toHaveBeenCalled();
    });

    it('1b — syncManifest skips when feature flag is disabled (no-op)', async () => {
      await service.syncManifest(TENANT_ID, DISABLED_SETTINGS, PLUGIN_HOST, {
        extensionSlots: [SLOT_DECLARATION],
      });

      expect(mockUpsertSlots).not.toHaveBeenCalled();
    });

    it('1c — after sync, getSlots returns the registered slot', async () => {
      mockGetSlots.mockResolvedValue([DB_SLOT]);

      const slots = await service.getSlots(TENANT_ID, ENABLED_SETTINGS);

      expect(slots).toHaveLength(1);
      expect(slots[0].slotId).toBe('toolbar-actions');
      expect(slots[0].pluginId).toBe(PLUGIN_HOST);
    });

    it('1d — contributor plugin syncs its contribution manifest', async () => {
      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_CONTRIB, {
        contributions: [CONTRIBUTION_DECLARATION],
      });

      expect(mockUpsertContributions).toHaveBeenCalledWith(TENANT_ID, PLUGIN_CONTRIB, [
        CONTRIBUTION_DECLARATION,
      ]);
      // Contributions trigger validation
      expect(mockValidateContributions).toHaveBeenCalledWith(TENANT_ID, PLUGIN_CONTRIB);
    });

    it('1e — getContributionsForSlot returns resolved contributions', async () => {
      mockGetContributionsForSlot.mockResolvedValue([DB_CONTRIBUTION]);

      const contributions = await service.getContributionsForSlot(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_HOST,
        'toolbar-actions'
      );

      expect(contributions).toHaveLength(1);
      expect(contributions[0].contributingPluginId).toBe(PLUGIN_CONTRIB);
      expect(contributions[0].isVisible).toBe(true);
      expect(contributions[0].isActive).toBe(true);
    });
  });

  // ── Scenario 2: Workspace visibility toggle round-trip ────────────────────

  describe('Scenario 2: Workspace visibility toggle round-trip (FR-022, FR-025)', () => {
    it('2a — setVisibility persists workspace-scoped visibility', async () => {
      mockSetVisibility.mockResolvedValue({ id: 'vis-new', isVisible: false });

      const result = await service.setVisibility(
        TENANT_ID,
        ENABLED_SETTINGS,
        WORKSPACE_ID,
        CONTRIBUTION_ID,
        false
      );

      expect(mockSetVisibility).toHaveBeenCalledWith(
        TENANT_ID,
        WORKSPACE_ID,
        CONTRIBUTION_ID,
        false
      );
      expect(result).toMatchObject({ isVisible: false });
    });

    it('2b — setVisibility invalidates cache (del called)', async () => {
      const matchingKey = `ext:contributions:${TENANT_ID}:${PLUGIN_HOST}:slot-x`;
      const fakeRedis = makeRedis({
        keys: vi.fn().mockResolvedValue([matchingKey]),
        // scan: first call returns matching keys, second call returns terminal cursor
        scan: vi
          .fn()
          .mockResolvedValueOnce(['42', [matchingKey]])
          .mockResolvedValueOnce(['0', []]),
        del: vi.fn().mockResolvedValue(1),
      });
      const fakeLogger = {
        child: vi.fn().mockReturnThis(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      };
      const svc = new ExtensionRegistryService(undefined, fakeRedis as never, fakeLogger as never);
      mockSetVisibility.mockResolvedValue({ id: 'vis-2', isVisible: true });

      await svc.setVisibility(TENANT_ID, ENABLED_SETTINGS, WORKSPACE_ID, CONTRIBUTION_ID, true);

      // del must be called at least twice: once for the slots key, once for the matched contribution key
      expect(fakeRedis.del).toHaveBeenCalledTimes(2);
      // scan was called iteratively until cursor reached '0'
      expect(fakeRedis.scan).toHaveBeenCalledTimes(2);
      // The matched contribution key was deleted
      expect(fakeRedis.del).toHaveBeenCalledWith(matchingKey);
    });

    it('2c — re-toggle visibility back to true succeeds', async () => {
      mockSetVisibility.mockResolvedValue({ id: 'vis-3', isVisible: true });

      const result = await service.setVisibility(
        TENANT_ID,
        ENABLED_SETTINGS,
        WORKSPACE_ID,
        CONTRIBUTION_ID,
        true
      );

      expect(result).toMatchObject({ isVisible: true });
    });
  });

  // ── Scenario 3: Plugin deactivation cascades to extension records ─────────

  describe('Scenario 3: Plugin deactivation cascade (FR-028)', () => {
    it('3a — deactivating the host plugin marks all its extension records inactive', async () => {
      await service.onPluginDeactivated(TENANT_ID, PLUGIN_HOST);

      expect(mockDeactivateByPlugin).toHaveBeenCalledWith(TENANT_ID, PLUGIN_HOST);
    });

    it('3b — after deactivation, slots query still runs but DB returns empty (mocked)', async () => {
      // After deactivation, slots are marked is_active=false in DB
      mockGetSlots.mockResolvedValue([]); // DB filtered out inactive rows

      const slots = await service.getSlots(TENANT_ID, ENABLED_SETTINGS);

      expect(slots).toHaveLength(0);
    });

    it('3c — deactivating contributor plugin also clears its contributions', async () => {
      await service.onPluginDeactivated(TENANT_ID, PLUGIN_CONTRIB);

      expect(mockDeactivateByPlugin).toHaveBeenCalledWith(TENANT_ID, PLUGIN_CONTRIB);
    });
  });

  // ── Scenario 4: Plugin re-activation restores extension records ────────────

  describe('Scenario 4: Plugin re-activation (FR-029)', () => {
    it('4a — re-activating a plugin calls reactivateByPlugin', async () => {
      await service.onPluginReactivated(TENANT_ID, PLUGIN_HOST);

      expect(mockReactivateByPlugin).toHaveBeenCalledWith(TENANT_ID, PLUGIN_HOST);
    });

    it('4b — after re-activation, syncManifest re-upserts current manifest data', async () => {
      await service.onPluginReactivated(TENANT_ID, PLUGIN_HOST);
      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_HOST, {
        extensionSlots: [SLOT_DECLARATION],
      });

      expect(mockReactivateByPlugin).toHaveBeenCalledOnce();
      expect(mockUpsertSlots).toHaveBeenCalledOnce();
    });
  });

  // ── Scenario 5: Orphaned contribution (Edge Case #2) ──────────────────────

  describe('Scenario 5: Orphaned contribution when contributing plugin is uninstalled (EC-2)', () => {
    it('5a — deactivating contributor plugin deactivates its contributions', async () => {
      await service.onPluginDeactivated(TENANT_ID, PLUGIN_CONTRIB);

      expect(mockDeactivateByPlugin).toHaveBeenCalledWith(TENANT_ID, PLUGIN_CONTRIB);
    });

    it('5b — getContributionsForSlot returns empty after contributor is deactivated', async () => {
      // After contributor deactivation, DB only returns active contributions
      mockGetContributionsForSlot.mockResolvedValue([]);

      const contributions = await service.getContributionsForSlot(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_HOST,
        'toolbar-actions'
      );

      expect(contributions).toHaveLength(0);
    });

    it('5c — slot still exists after contributor plugin is removed', async () => {
      // Host plugin's slot remains active; only contributions are gone
      mockGetSlots.mockResolvedValue([DB_SLOT]);

      const slots = await service.getSlots(TENANT_ID, ENABLED_SETTINGS);
      expect(slots).toHaveLength(1);
      expect(slots[0].pluginId).toBe(PLUGIN_HOST);
    });
  });

  // ── Scenario 6: Type mismatch — contribution targets non-existent slot (EC-7) ──

  describe('Scenario 6: Slot type mismatch (EC-7)', () => {
    it('6a — validateContributions returns invalid status for type mismatch', async () => {
      mockValidateContributions.mockResolvedValue([
        {
          contributionId: CONTRIBUTION_ID,
          contributingPluginId: PLUGIN_CONTRIB,
          targetPluginId: PLUGIN_HOST,
          targetSlotId: 'nonexistent-slot',
          status: 'invalid',
          reason: 'Target slot not found',
        },
      ]);

      const results = await service.validateContributions(
        TENANT_ID,
        ENABLED_SETTINGS,
        PLUGIN_CONTRIB
      );

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('invalid');
      expect(results[0].reason).toBe('Target slot not found');
    });

    it('6b — invalid contributions are still stored but marked invalid', async () => {
      // Upsert still runs — validation is advisory
      await service.syncManifest(TENANT_ID, ENABLED_SETTINGS, PLUGIN_CONTRIB, {
        contributions: [CONTRIBUTION_DECLARATION],
      });

      expect(mockUpsertContributions).toHaveBeenCalled();
      expect(mockValidateContributions).toHaveBeenCalled();
    });
  });

  // ── Scenario 7: Feature flag disabled — all queries fail gracefully ────────

  describe('Scenario 7: Feature flag disabled — EXTENSION_POINTS_DISABLED (FR-040)', () => {
    it('7a — getSlots throws with EXTENSION_POINTS_DISABLED code', async () => {
      const err = await service
        .getSlots(TENANT_ID, DISABLED_SETTINGS)
        .catch((e: unknown) => e as Error);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('EXTENSION_POINTS_DISABLED');
    });

    it('7b — getContributionsForSlot throws with EXTENSION_POINTS_DISABLED code', async () => {
      const err = (await service
        .getContributionsForSlot(TENANT_ID, DISABLED_SETTINGS, PLUGIN_HOST, 'toolbar-actions')
        .catch((e: unknown) => e)) as Error;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('EXTENSION_POINTS_DISABLED');
    });

    it('7c — setVisibility throws with EXTENSION_POINTS_DISABLED code', async () => {
      const err = (await service
        .setVisibility(TENANT_ID, DISABLED_SETTINGS, WORKSPACE_ID, CONTRIBUTION_ID, false)
        .catch((e: unknown) => e)) as Error;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('EXTENSION_POINTS_DISABLED');
    });

    it('7d — getSlotDependents throws with EXTENSION_POINTS_DISABLED code', async () => {
      const err = (await service
        .getSlotDependents(TENANT_ID, DISABLED_SETTINGS, PLUGIN_HOST, 'toolbar-actions')
        .catch((e: unknown) => e)) as Error;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('EXTENSION_POINTS_DISABLED');
    });

    it('7e — syncManifest is a no-op (does not throw) when flag is disabled', async () => {
      await expect(
        service.syncManifest(TENANT_ID, DISABLED_SETTINGS, PLUGIN_HOST, {
          extensionSlots: [SLOT_DECLARATION],
        })
      ).resolves.toBeUndefined();

      expect(mockUpsertSlots).not.toHaveBeenCalled();
    });
  });
});
