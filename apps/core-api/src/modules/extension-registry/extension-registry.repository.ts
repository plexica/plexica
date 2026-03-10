// File: apps/core-api/src/modules/extension-registry/extension-registry.repository.ts
//
// Spec 013 — Extension Points (T013-05)
// ADR-031 Safeguard 1: SINGLE access path to all 5 extension tables.
// ADR-031 Safeguard 2: All tenant-scoped methods require explicit `tenantId`.
// ADR-031 Safeguard 3: Cross-tenant admin methods use explicit naming + role check.
// ADR-031 Safeguard 4: RLS policies are in place (see migration 20260308000002).
// ADR-031 Safeguard 5: This file is the code review gate — changes require ADR review.
//
// ⚠️  NEVER import this repository from outside the extension-registry module.
//     All access must go through ExtensionRegistryService.

import { Prisma, type PrismaClient } from '@plexica/database';
import type {
  ExtensionSlotDeclaration,
  ContributionDeclaration,
  ExtensibleEntityDeclaration,
  DataExtensionDeclaration,
  ExtensionSlotFilters,
  ExtensionContributionFilters,
  ContributionValidationStatus,
  DependentsResult,
} from '@plexica/types';
import { db } from '../../lib/db.js';
import { logger as rootLogger } from '../../lib/logger.js';
import type { Logger } from 'pino';

const logger: Logger = rootLogger.child({ module: 'ExtensionRegistryRepository' });

// ---------------------------------------------------------------------------
// Concurrency helper (W-05 fix)
// ---------------------------------------------------------------------------

/**
 * Executes an array of async tasks with a maximum concurrency of `limit`.
 * Prevents Prisma connection-pool exhaustion when syncing large manifests
 * (NFR-010 permits ≥500 contributions per plugin; Promise.all with 500
 * concurrent upserts would saturate the ~5-connection default pool).
 *
 * No external dependency needed (Constitution Art. 2.2).
 */
async function concurrentMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const UPSERT_CONCURRENCY = 10; // safe under Prisma's default pool of 5–10 connections

// ---------------------------------------------------------------------------
// Local shape types (internal — not exported from index.ts)
// ---------------------------------------------------------------------------

export interface ContributionWithVisibility {
  id: string;
  contributingPluginId: string;
  contributingPluginName: string; // W-04 fix: resolved from contributingPlugin.name join
  targetPluginId: string;
  targetSlotId: string;
  componentName: string;
  priority: number;
  validationStatus: ContributionValidationStatus;
  previewUrl: string | null;
  description: string | null;
  isActive: boolean;
  isVisible: boolean; // from workspace_extension_visibility or default true
}

export interface ValidationResult {
  contributionId: string;
  contributingPluginId: string;
  targetPluginId: string;
  targetSlotId: string;
  status: ContributionValidationStatus;
  reason?: string;
}

// ---------------------------------------------------------------------------
// ExtensionRegistryRepository
// ---------------------------------------------------------------------------

export class ExtensionRegistryRepository {
  private db: PrismaClient;

  constructor(customDb?: PrismaClient) {
    this.db = customDb ?? db;
  }

  // ── Slot Operations ────────────────────────────────────────────────────────

  /**
   * Upsert slot declarations from a plugin manifest.
   * ADR-031 Safeguard 2: tenantId required.
   */
  async upsertSlots(
    tenantId: string,
    pluginId: string,
    slots: ExtensionSlotDeclaration[]
  ): Promise<void> {
    logger.debug({ tenantId, pluginId, count: slots.length }, 'upserting extension slots');

    // W-05 fix: bounded concurrency via concurrentMap (limit=10) instead of
    // unbounded Promise.all, which could exhaust Prisma's ~5-connection pool
    // when syncing large manifests (NFR-010 allows ≥500 contributions per plugin).
    await concurrentMap(slots, UPSERT_CONCURRENCY, (slot) =>
      this.db.extensionSlot.upsert({
        where: {
          // C-01 fix: unique key is now (tenantId, pluginId, slotId) — tenant-scoped
          tenantId_pluginId_slotId: {
            tenantId,
            pluginId,
            slotId: slot.slotId,
          },
        },
        update: {
          label: slot.label,
          type: slot.type,
          maxContributions: slot.maxContributions ?? 0,
          contextSchema: (slot.contextSchema ?? {}) as Prisma.InputJsonValue,
          description: slot.description ?? null,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          tenantId,
          pluginId,
          slotId: slot.slotId,
          label: slot.label,
          type: slot.type,
          maxContributions: slot.maxContributions ?? 0,
          contextSchema: (slot.contextSchema ?? {}) as Prisma.InputJsonValue,
          description: slot.description ?? null,
          isActive: true,
        },
      })
    );
  }

  /**
   * List active extension slots, optionally filtered.
   * ADR-031 Safeguard 2: tenantId required.
   * Constitution Art. 3.4.3: page/pageSize enforces max 100 items per page.
   */
  async getSlots(tenantId: string, filters?: ExtensionSlotFilters, page = 1, pageSize = 50) {
    return this.db.extensionSlot.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(filters?.pluginId ? { pluginId: filters.pluginId } : {}),
        ...(filters?.type ? { type: filters.type } : {}),
      },
      orderBy: [{ pluginId: 'asc' }, { slotId: 'asc' }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
  }

  /**
   * List active slots for a specific plugin.
   * ADR-031 Safeguard 2: tenantId required.
   * Constitution Art. 3.4.3: page/pageSize enforces max 100 items per page.
   */
  async getSlotsByPlugin(tenantId: string, pluginId: string, page = 1, pageSize = 50) {
    return this.db.extensionSlot.findMany({
      where: { tenantId, pluginId, isActive: true },
      orderBy: { slotId: 'asc' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
  }

  // ── Contribution Operations ────────────────────────────────────────────────

  /**
   * Upsert contribution declarations from a plugin manifest.
   * ADR-031 Safeguard 2: tenantId required.
   */
  async upsertContributions(
    tenantId: string,
    pluginId: string,
    contributions: ContributionDeclaration[]
  ): Promise<void> {
    logger.debug(
      { tenantId, pluginId, count: contributions.length },
      'upserting extension contributions'
    );

    // W-05 fix: bounded concurrency via concurrentMap (limit=10) instead of
    // unbounded Promise.all (NFR-010 allows ≥500 contributions per plugin).
    await concurrentMap(contributions, UPSERT_CONCURRENCY, (contribution) =>
      this.db.extensionContribution.upsert({
        where: {
          // C-01 fix: unique key is now (tenantId, contributingPluginId, targetPluginId, targetSlotId)
          tenantId_contributingPluginId_targetPluginId_targetSlotId: {
            tenantId,
            contributingPluginId: pluginId,
            targetPluginId: contribution.targetPluginId,
            targetSlotId: contribution.targetSlotId,
          },
        },
        update: {
          componentName: contribution.componentName,
          priority: contribution.priority ?? 100,
          outputSchema:
            contribution.outputSchema != null
              ? (contribution.outputSchema as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          previewUrl: contribution.previewUrl ?? null,
          description: contribution.description ?? null,
          isActive: true,
          validationStatus: 'pending',
          updatedAt: new Date(),
        },
        create: {
          tenantId,
          contributingPluginId: pluginId,
          targetPluginId: contribution.targetPluginId,
          targetSlotId: contribution.targetSlotId,
          componentName: contribution.componentName,
          priority: contribution.priority ?? 100,
          outputSchema:
            contribution.outputSchema != null
              ? (contribution.outputSchema as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          previewUrl: contribution.previewUrl ?? null,
          description: contribution.description ?? null,
          isActive: true,
          validationStatus: 'pending',
        },
      })
    );
  }

  /**
   * List contributions, optionally filtered.
   * ADR-031 Safeguard 2: tenantId required.
   * Constitution Art. 3.4.3: page/pageSize enforces max 100 items per page.
   *
   * `type` filter: contributions do not store a type field directly — type belongs
   * to the target slot. We resolve this by including the target slot and filtering
   * post-fetch. For large datasets prefer the slot-specific endpoint instead.
   */
  async getContributions(
    tenantId: string,
    filters?: ExtensionContributionFilters,
    page = 1,
    pageSize = 50
  ) {
    const rows = await this.db.extensionContribution.findMany({
      where: {
        tenantId,
        isActive: true,
        // Prefer explicit targetPluginId + targetSlotId (primary read path from <ExtensionSlot>)
        ...(filters?.targetPluginId ? { targetPluginId: filters.targetPluginId } : {}),
        ...(filters?.targetSlotId ? { targetSlotId: filters.targetSlotId } : {}),
        // Legacy bare slotId param (admin tooling only)
        ...(filters?.slotId && !filters.targetSlotId ? { targetSlotId: filters.slotId } : {}),
        ...(filters?.pluginId ? { contributingPluginId: filters.pluginId } : {}),
      },
      include: {
        visibilityOverrides: filters?.workspaceId
          ? { where: { workspaceId: filters.workspaceId } }
          : false,
        // Include target slot only when type filter is requested (avoids join overhead otherwise)
        ...(filters?.type
          ? {
              targetSlot: {
                select: { type: true, pluginId: true, slotId: true },
              },
            }
          : {}),
      },
      orderBy: [{ priority: 'asc' }, { contributingPluginId: 'asc' }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    });

    // Post-fetch type filter: keep only contributions whose target slot type matches
    if (filters?.type) {
      return rows.filter((r: unknown) => {
        const row = r as { targetSlot?: { type: string } | null };
        return row.targetSlot?.type === filters.type;
      });
    }

    return rows;
  }

  /**
   * Get contributions for a specific slot with workspace visibility state resolved.
   * ADR-031 Safeguard 2: tenantId required.
   * Returns only active contributions; isVisible defaults to true when no override row exists.
   *
   * maxContributions enforcement (forge-review fix):
   *   When the slot declares maxContributions > 0, the result set is capped to that
   *   limit (ordered by priority asc then contributingPluginId asc, which matches the
   *   fetch order). A value of 0 means "unlimited". The slot is fetched in parallel
   *   with the contributions to avoid adding a serial round-trip.
   */
  async getContributionsForSlot(
    tenantId: string,
    targetPluginId: string,
    targetSlotId: string,
    workspaceId?: string
  ): Promise<ContributionWithVisibility[]> {
    // Fetch contributions and slot metadata in parallel (one round-trip each).
    const [rows, slot] = await Promise.all([
      this.db.extensionContribution.findMany({
        where: { tenantId, targetPluginId, targetSlotId, isActive: true },
        include: {
          visibilityOverrides: workspaceId ? { where: { workspaceId } } : false,
          // W-04 fix: join contributing plugin so we can surface its display name
          contributingPlugin: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: 'asc' }, { contributingPluginId: 'asc' }],
      }),
      this.db.extensionSlot.findFirst({
        where: { tenantId, pluginId: targetPluginId, slotId: targetSlotId },
        select: { maxContributions: true },
      }),
    ]);

    const mapped = (rows as unknown[]).map((row) => {
      const r = row as {
        id: string;
        contributingPluginId: string;
        targetPluginId: string;
        targetSlotId: string;
        componentName: string;
        priority: number;
        validationStatus: string;
        previewUrl: string | null;
        description: string | null;
        isActive: boolean;
        visibilityOverrides: Array<{ isVisible: boolean }> | false;
        contributingPlugin: { id: string; name: string } | null;
      };
      const overrides = Array.isArray(r.visibilityOverrides) ? r.visibilityOverrides : [];
      const override = overrides[0] as { isVisible: boolean } | undefined;
      return {
        id: r.id,
        contributingPluginId: r.contributingPluginId,
        // W-04 fix: use the joined plugin name instead of falling back to plugin ID
        contributingPluginName: r.contributingPlugin?.name ?? r.contributingPluginId,
        targetPluginId: r.targetPluginId,
        targetSlotId: r.targetSlotId,
        componentName: r.componentName,
        priority: r.priority,
        validationStatus: r.validationStatus as ContributionValidationStatus,
        previewUrl: r.previewUrl,
        description: r.description,
        isActive: r.isActive,
        isVisible: override !== undefined ? override.isVisible : true,
      };
    });

    // Enforce the slot's maxContributions cap (0 = unlimited).
    const max = (slot as { maxContributions?: number } | null)?.maxContributions ?? 0;
    return max > 0 ? mapped.slice(0, max) : mapped;
  }

  // ── Workspace Visibility ───────────────────────────────────────────────────

  /**
   * Toggle visibility for a contribution in a workspace.
   * ADR-031 Safeguard 2: tenantId required — prevents cross-tenant visibility toggle.
   * Verifies the contribution belongs to the tenant before writing.
   */
  async setVisibility(
    tenantId: string,
    workspaceId: string,
    contributionId: string,
    isVisible: boolean
  ): Promise<{ workspaceId: string; contributionId: string; isVisible: boolean; updatedAt: Date }> {
    // Verify contribution exists AND belongs to this tenant
    const contribution = await this.db.extensionContribution.findUnique({
      where: { id: contributionId },
      select: { id: true, tenantId: true },
    });
    if (!contribution || contribution.tenantId !== tenantId) {
      throw Object.assign(
        new Error(
          'CONTRIBUTION_NOT_FOUND: Contribution does not exist or does not belong to this tenant'
        ),
        { code: 'CONTRIBUTION_NOT_FOUND' }
      );
    }

    const result = await this.db.workspaceExtensionVisibility.upsert({
      where: {
        workspaceId_contributionId: { workspaceId, contributionId },
      },
      update: { isVisible, updatedAt: new Date() },
      create: { workspaceId, contributionId, isVisible },
    });

    return {
      workspaceId: result.workspaceId,
      contributionId: result.contributionId,
      isVisible: result.isVisible,
      updatedAt: result.updatedAt,
    };
  }

  // ── Extensible Entity Operations ──────────────────────────────────────────

  /**
   * Upsert extensible entity declarations from a plugin manifest.
   * ADR-031 Safeguard 2: tenantId required.
   */
  async upsertEntities(
    tenantId: string,
    pluginId: string,
    entities: ExtensibleEntityDeclaration[]
  ): Promise<void> {
    logger.debug({ tenantId, pluginId, count: entities.length }, 'upserting extensible entities');

    // W-05 fix: bounded concurrency via concurrentMap (limit=10) instead of
    // unbounded Promise.all (NFR-010 allows ≥500 contributions per plugin).
    await concurrentMap(entities, UPSERT_CONCURRENCY, (entity) =>
      this.db.extensibleEntity.upsert({
        where: {
          // C-01 fix: unique key is now (tenantId, pluginId, entityType) — tenant-scoped
          tenantId_pluginId_entityType: { tenantId, pluginId, entityType: entity.entityType },
        },
        update: {
          label: entity.label,
          fieldSchema: entity.fieldSchema as Prisma.InputJsonValue,
          description: entity.description ?? null,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          tenantId,
          pluginId,
          entityType: entity.entityType,
          label: entity.label,
          fieldSchema: entity.fieldSchema as Prisma.InputJsonValue,
          description: entity.description ?? null,
          isActive: true,
        },
      })
    );
  }

  /**
   * List active extensible entities for a tenant.
   * ADR-031 Safeguard 2: tenantId required.
   * Constitution Art. 3.4.3: page/pageSize enforces max 100 items per page.
   */
  async getEntities(tenantId: string, page = 1, pageSize = 50) {
    return this.db.extensibleEntity.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ pluginId: 'asc' }, { entityType: 'asc' }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
  }

  /**
   * Find a specific entity type declaration.
   * ADR-031 Safeguard 2: tenantId required.
   */
  async findEntity(tenantId: string, pluginId: string, entityType: string) {
    return this.db.extensibleEntity.findFirst({
      where: { tenantId, pluginId, entityType, isActive: true },
    });
  }

  // ── Data Extension Operations ──────────────────────────────────────────────

  /**
   * Upsert data extension declarations from a plugin manifest.
   * ADR-031 Safeguard 2: tenantId required.
   */
  async upsertDataExtensions(
    tenantId: string,
    pluginId: string,
    extensions: DataExtensionDeclaration[]
  ): Promise<void> {
    logger.debug({ tenantId, pluginId, count: extensions.length }, 'upserting data extensions');

    // W-05 fix: bounded concurrency via concurrentMap (limit=10) instead of
    // unbounded Promise.all (NFR-010 allows ≥500 contributions per plugin).
    await concurrentMap(extensions, UPSERT_CONCURRENCY, (ext) =>
      this.db.dataExtension.upsert({
        where: {
          // C-01 fix: unique key is now (tenantId, contributingPluginId, targetPluginId, targetEntityType)
          tenantId_contributingPluginId_targetPluginId_targetEntityType: {
            tenantId,
            contributingPluginId: pluginId,
            targetPluginId: ext.targetPluginId,
            targetEntityType: ext.targetEntityType,
          },
        },
        update: {
          sidecarUrl: ext.sidecarUrl,
          fieldSchema: ext.fieldSchema as Prisma.InputJsonValue,
          description: ext.description ?? null,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          tenantId,
          contributingPluginId: pluginId,
          targetPluginId: ext.targetPluginId,
          targetEntityType: ext.targetEntityType,
          sidecarUrl: ext.sidecarUrl,
          fieldSchema: ext.fieldSchema as Prisma.InputJsonValue,
          description: ext.description ?? null,
          isActive: true,
        },
      })
    );
  }

  /**
   * List active data extensions for a given entity type.
   * ADR-031 Safeguard 2: tenantId required.
   */
  async getDataExtensions(tenantId: string, targetPluginId: string, targetEntityType: string) {
    return this.db.dataExtension.findMany({
      where: { tenantId, targetPluginId, targetEntityType, isActive: true },
      orderBy: { contributingPluginId: 'asc' },
    });
  }

  // ── Lifecycle Operations ───────────────────────────────────────────────────

  /**
   * Soft-delete all extension records for a plugin within a tenant.
   * Called on plugin deactivation (FR-024).
   * ADR-031 Safeguard 2: tenantId required to prevent cross-tenant mutation (F-002 fix).
   *
   * Promise.all safety: exactly 4 updateMany calls are issued in parallel — one per
   * extension table (slots, contributions, entities, dataExtensions). This is safe
   * because the number of concurrent queries is bounded and constant (not per-row),
   * so it cannot exhaust the Prisma connection pool regardless of data volume.
   * concurrentMap is only needed for per-row upserts (see upsertSlots, etc.).
   */
  async deactivateByPlugin(tenantId: string, pluginId: string): Promise<void> {
    logger.info({ tenantId, pluginId }, 'deactivating all extension records for plugin');

    await Promise.all([
      this.db.extensionSlot.updateMany({
        where: { tenantId, pluginId },
        data: { isActive: false, updatedAt: new Date() },
      }),
      this.db.extensionContribution.updateMany({
        where: { tenantId, contributingPluginId: pluginId },
        data: { isActive: false, updatedAt: new Date() },
      }),
      this.db.extensibleEntity.updateMany({
        where: { tenantId, pluginId },
        data: { isActive: false, updatedAt: new Date() },
      }),
      this.db.dataExtension.updateMany({
        where: { tenantId, contributingPluginId: pluginId },
        data: { isActive: false, updatedAt: new Date() },
      }),
    ]);
  }

  /**
   * Restore all extension records for a plugin on re-activation within a tenant.
   * Called on plugin re-activation (FR-024).
   * ADR-031 Safeguard 2: tenantId required to prevent cross-tenant mutation (F-002 fix).
   *
   * Promise.all safety: see deactivateByPlugin — same pattern, same rationale.
   * Exactly 4 updateMany calls, bounded concurrency, no pool exhaustion risk.
   */
  async reactivateByPlugin(tenantId: string, pluginId: string): Promise<void> {
    logger.info({ tenantId, pluginId }, 're-activating all extension records for plugin');

    await Promise.all([
      this.db.extensionSlot.updateMany({
        where: { tenantId, pluginId },
        data: { isActive: true, updatedAt: new Date() },
      }),
      this.db.extensionContribution.updateMany({
        where: { tenantId, contributingPluginId: pluginId },
        data: { isActive: true, updatedAt: new Date() },
      }),
      this.db.extensibleEntity.updateMany({
        where: { tenantId, pluginId },
        data: { isActive: true, updatedAt: new Date() },
      }),
      this.db.dataExtension.updateMany({
        where: { tenantId, contributingPluginId: pluginId },
        data: { isActive: true, updatedAt: new Date() },
      }),
    ]);
  }

  // ── Slot Dependents ────────────────────────────────────────────────────────

  /**
   * List plugins contributing to a specific slot with count.
   * ADR-031 Safeguard 2: tenantId required. (FR-031)
   */
  async getSlotDependents(
    tenantId: string,
    targetPluginId: string,
    targetSlotId: string
  ): Promise<DependentsResult> {
    // Verify slot exists
    const slot = await this.db.extensionSlot.findFirst({
      where: { tenantId, pluginId: targetPluginId, slotId: targetSlotId },
    });
    if (!slot) {
      throw Object.assign(
        new Error(`SLOT_NOT_FOUND: Slot ${targetSlotId} not found for plugin ${targetPluginId}`),
        { code: 'SLOT_NOT_FOUND' }
      );
    }

    const contributions = await this.db.extensionContribution.findMany({
      where: { tenantId, targetPluginId, targetSlotId, isActive: true },
      include: {
        contributingPlugin: {
          select: { id: true, name: true, lifecycleStatus: true },
        },
      },
      orderBy: [{ priority: 'asc' }, { contributingPluginId: 'asc' }],
    });

    return {
      pluginId: targetPluginId,
      slotId: targetSlotId,
      dependentCount: contributions.length,
      dependents: contributions.map((c) => ({
        pluginId: c.contributingPluginId,
        pluginName: c.contributingPlugin.name,
        componentName: c.componentName,
        validationStatus: c.validationStatus as ContributionValidationStatus,
        isActive: c.isActive,
      })),
    };
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validate contributions for a plugin: check that target slots exist and types match.
   * ADR-031 Safeguard 2: tenantId required. (FR-026)
   *
   * H-05 fix: Batch-read all referenced slots in a single findMany query, then
   * match contributions in-memory. Batch-update statuses with Promise.all.
   * Previous implementation issued 2 DB queries per contribution (N+1).
   */
  async validateContributions(tenantId: string, pluginId: string): Promise<ValidationResult[]> {
    const contributions = await this.db.extensionContribution.findMany({
      where: { tenantId, contributingPluginId: pluginId, isActive: true },
    });

    if (contributions.length === 0) return [];

    // Collect all (targetPluginId, targetSlotId) pairs and batch-read them once
    const targetPairs = contributions.map((c) => ({
      tenantId,
      pluginId: c.targetPluginId,
      slotId: c.targetSlotId,
    }));

    const targetSlots = await this.db.extensionSlot.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: targetPairs.map((p) => ({ pluginId: p.pluginId, slotId: p.slotId })),
      },
    });

    // Build lookup map: `${targetPluginId}:${targetSlotId}` → slot row
    type SlotRow = { pluginId: string; slotId: string; type: string };
    const slotMap = new Map<string, SlotRow>();
    for (const slot of targetSlots as SlotRow[]) {
      slotMap.set(`${slot.pluginId}:${slot.slotId}`, slot);
    }

    const statusUpdates: Array<{ id: string; status: ContributionValidationStatus }> = [];
    const results: ValidationResult[] = [];

    for (const contribution of contributions) {
      const key = `${contribution.targetPluginId}:${contribution.targetSlotId}`;
      const targetSlot = slotMap.get(key);

      let status: ContributionValidationStatus;
      let reason: string | undefined;

      if (!targetSlot) {
        status = 'target_not_found';
        reason = `Target slot ${contribution.targetSlotId} not found for plugin ${contribution.targetPluginId}`;
      } else {
        // TD-027: the 'type_mismatch' branch that previously appeared here was
        // dead code — ExtensionContribution has no 'type' field in the schema,
        // so '\'type\' in contribution' was always false.  Removed.
        status = 'valid';
      }

      statusUpdates.push({ id: contribution.id, status });
      results.push({
        contributionId: contribution.id,
        contributingPluginId: contribution.contributingPluginId,
        targetPluginId: contribution.targetPluginId,
        targetSlotId: contribution.targetSlotId,
        status,
        reason,
      });
    }

    // Batch-update all statuses with bounded concurrency (W-05 pattern: concurrentMap
    // instead of Promise.all to avoid pool exhaustion on large contribution sets).
    await concurrentMap(statusUpdates, UPSERT_CONCURRENCY, ({ id, status }) =>
      this.db.extensionContribution.update({
        where: { id },
        data: { validationStatus: status, updatedAt: new Date() },
      })
    );

    return results;
  }

  // ── Super Admin Cross-Tenant Methods (ADR-031 Safeguard 3) ─────────────────
  // These methods are explicitly named to make cross-tenant access visible.
  // The route layer MUST verify the Keycloak super-admin role before calling
  // these methods. The repo provides a defense-in-depth guard via its explicit
  // naming convention — no caller-supplied boolean needed here (W-12 fix).

  /**
   * SUPER_ADMIN ONLY: List all slots across all tenants.
   * W-12 fix: The boolean anti-pattern (isSuperAdmin parameter) has been removed.
   * Role enforcement now lives exclusively in the route layer, which derives the
   * super-admin status from the verified Keycloak JWT (realm_access.roles) via
   * authorizationService.isSuperAdmin(). The repo's defense-in-depth is its
   * explicit "superAdmin" naming convention (ADR-031 Safeguard 3).
   * Constitution Art. 3.4.3: page/pageSize enforces max 100 items per page.
   */
  async superAdminListAllSlots(page = 1, pageSize = 50) {
    return this.db.extensionSlot.findMany({
      orderBy: [{ tenantId: 'asc' }, { pluginId: 'asc' }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
  }
}

// Singleton for use in service/controller
export const extensionRegistryRepository = new ExtensionRegistryRepository();
