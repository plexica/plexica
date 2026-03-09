// File: apps/core-api/src/modules/extension-registry/extension-registry.service.ts
//
// Spec 013 — Extension Points (T013-06)
// Business logic layer for the Extension Registry.
// All data access goes through ExtensionRegistryRepository (ADR-031 Safeguard 1).
//
// Feature flag: extension_points_enabled must be true in tenant settings (Art. 9.1.1).
// Redis cache: TTL = 120s ± random(0..30)s jitter (plan.md §4.7).
// Sidecar aggregation: Promise.allSettled — never throws on partial failure.

import type { PrismaClient } from '@plexica/database';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type {
  ExtensionSlotDeclaration,
  ContributionDeclaration,
  ExtensibleEntityDeclaration,
  DataExtensionDeclaration,
  ExtensionSlotFilters,
  ExtensionContributionFilters,
  AggregatedExtensionData,
  ResolvedContribution,
  DependentsResult,
} from '@plexica/types';
import {
  ExtensionRegistryRepository,
  type ValidationResult,
  type ContributionWithVisibility,
} from './extension-registry.repository.js';
import { isExtensionPointsEnabled } from './extension-registry.schema.js';
import { logger as rootLogger } from '../../lib/logger.js';
import { redis as defaultRedis } from '../../lib/redis.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_BASE_TTL_S = 120;
const CACHE_TTL_JITTER_MAX_S = 30;
const SIDECAR_FETCH_TIMEOUT_MS = 3_000; // fail-fast on slow plugin containers

// SSRF blocklist: cloud IMDS endpoints, loopback, and link-local addresses.
// Applied at both registration-time (upsertDataExtensions) and fetch-time.
const SSRF_BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.internal',
  'instance-data', // GCP alias
]);
const SSRF_BLOCKED_HOST_PATTERN =
  /^(169\.254\.\d+\.\d+|127\.\d+\.\d+\.\d+|::1|fc00:|fd[0-9a-f]{2}:)/i;

/**
 * Validates a sidecarUrl string against SSRF risks.
 * Throws an error (code: SSRF_BLOCKED) if the URL is unsafe.
 *
 * Rules:
 *  1. Must be http or https scheme only.
 *  2. Must not target IMDS hostnames (169.254.x.x, metadata.google.internal …).
 *  3. Must not target loopback / link-local / ULA addresses.
 */
function assertSafeUrl(rawUrl: string, fieldName = 'sidecarUrl'): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error(`SSRF_BLOCKED: ${fieldName} is not a valid URL`), {
      code: 'SSRF_BLOCKED',
    });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw Object.assign(new Error(`SSRF_BLOCKED: ${fieldName} must use http or https scheme`), {
      code: 'SSRF_BLOCKED',
    });
  }

  const host = parsed.hostname.toLowerCase();
  if (SSRF_BLOCKED_HOSTNAMES.has(host) || SSRF_BLOCKED_HOST_PATTERN.test(host)) {
    throw Object.assign(
      new Error(`SSRF_BLOCKED: ${fieldName} targets a blocked address (IMDS/loopback/link-local)`),
      { code: 'SSRF_BLOCKED' }
    );
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** TTL = 120s + random(0..30)s jitter to prevent cache stampede */
function cacheTtl(): number {
  return CACHE_BASE_TTL_S + Math.floor(Math.random() * (CACHE_TTL_JITTER_MAX_S + 1));
}

function slotsCacheKey(tenantId: string): string {
  return `ext:slots:${tenantId}`;
}

function contributionsCacheKey(
  tenantId: string,
  targetPluginId: string,
  targetSlotId: string
): string {
  return `ext:contributions:${tenantId}:${targetPluginId}:${targetSlotId}`;
}

// ---------------------------------------------------------------------------
// ExtensionRegistryService
// ---------------------------------------------------------------------------

export class ExtensionRegistryService {
  private repo: ExtensionRegistryRepository;
  private redis: Redis;
  private log: Logger;

  constructor(customDb?: PrismaClient, customRedis?: Redis, customLogger?: Logger) {
    this.repo = new ExtensionRegistryRepository(customDb);
    this.redis = customRedis ?? defaultRedis;
    this.log = (customLogger ?? rootLogger).child({ module: 'ExtensionRegistryService' });
  }

  // ── Feature Flag Guard ─────────────────────────────────────────────────────

  /**
   * Throws a typed error when extension points are disabled for the tenant.
   * Callers in the controller should catch this and return 403.
   */
  private assertEnabled(tenantSettings: Record<string, unknown>): void {
    if (!isExtensionPointsEnabled(tenantSettings)) {
      throw Object.assign(
        new Error('EXTENSION_POINTS_DISABLED: Extension points are not enabled for this tenant'),
        { code: 'EXTENSION_POINTS_DISABLED' }
      );
    }
  }

  // ── Plugin Manifest Sync ──────────────────────────────────────────────────

  /**
   * Syncs all extension declarations from a plugin manifest into the registry.
   * Called from the plugin lifecycle hooks on ACTIVE transition (T013-09).
   *
   * tenantSettings is passed in to avoid a DB round-trip inside this method.
   */
  async syncManifest(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    pluginId: string,
    manifest: {
      extensionSlots?: ExtensionSlotDeclaration[];
      contributions?: ContributionDeclaration[];
      extensibleEntities?: ExtensibleEntityDeclaration[];
      dataExtensions?: DataExtensionDeclaration[];
    }
  ): Promise<void> {
    if (!isExtensionPointsEnabled(tenantSettings)) {
      this.log.debug(
        { tenantId, pluginId },
        'extension_points_enabled=false — skipping manifest sync'
      );
      return;
    }

    this.log.info({ tenantId, pluginId }, 'syncing extension manifest');

    const [slots, contributions, entities, dataExtensions] = [
      manifest.extensionSlots ?? [],
      manifest.contributions ?? [],
      manifest.extensibleEntities ?? [],
      manifest.dataExtensions ?? [],
    ];

    if (slots.length) await this.repo.upsertSlots(tenantId, pluginId, slots);
    if (contributions.length)
      await this.repo.upsertContributions(tenantId, pluginId, contributions);
    if (entities.length) await this.repo.upsertEntities(tenantId, pluginId, entities);
    if (dataExtensions.length)
      await this.repo.upsertDataExtensions(tenantId, pluginId, dataExtensions);

    // Validate contributions after upsert
    if (contributions.length) {
      await this.repo.validateContributions(tenantId, pluginId);
    }

    // Invalidate affected cache keys
    await this.invalidateSlotCache(tenantId);
    this.log.debug({ tenantId, pluginId }, 'extension manifest sync complete');
  }

  // ── Plugin Lifecycle Hooks ─────────────────────────────────────────────────

  /**
   * Called when a plugin is deactivated — soft-deletes all extension records.
   * Not feature-flag gated (deactivation should always clean up).
   * tenantId required to scope the operation (ADR-031 Safeguard 2, F-002 fix).
   */
  async onPluginDeactivated(tenantId: string, pluginId: string): Promise<void> {
    this.log.info({ tenantId, pluginId }, 'extension-registry: plugin deactivated');
    await this.repo.deactivateByPlugin(tenantId, pluginId);
  }

  /**
   * Called when a plugin is re-activated — restores all extension records.
   * tenantId required to scope the operation (ADR-031 Safeguard 2, F-002 fix).
   */
  async onPluginReactivated(tenantId: string, pluginId: string): Promise<void> {
    this.log.info({ tenantId, pluginId }, 'extension-registry: plugin reactivated');
    await this.repo.reactivateByPlugin(tenantId, pluginId);
  }

  // ── Slot Queries ──────────────────────────────────────────────────────────

  /**
   * List extension slots for a tenant, with optional filters.
   * Results are cached with TTL jitter.
   */
  async getSlots(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    filters?: ExtensionSlotFilters
  ) {
    this.assertEnabled(tenantSettings);

    // Only cache the un-filtered listing
    if (!filters?.pluginId && !filters?.type) {
      const cacheKey = slotsCacheKey(tenantId);
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as Awaited<ReturnType<typeof this.repo.getSlots>>;
        } catch {
          // stale/corrupt cache — fall through to DB
        }
      }

      const slots = await this.repo.getSlots(tenantId, filters);
      await this.redis.set(cacheKey, JSON.stringify(slots), 'EX', cacheTtl());
      return slots;
    }

    return this.repo.getSlots(tenantId, filters);
  }

  /**
   * List slots for a specific plugin.
   */
  async getSlotsByPlugin(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    pluginId: string
  ) {
    this.assertEnabled(tenantSettings);
    return this.repo.getSlotsByPlugin(tenantId, pluginId);
  }

  // ── Contribution Queries ──────────────────────────────────────────────────

  /**
   * List contributions with optional filters.
   */
  async getContributions(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    filters?: ExtensionContributionFilters
  ) {
    this.assertEnabled(tenantSettings);
    return this.repo.getContributions(tenantId, filters);
  }

  /**
   * Get contributions for a specific slot resolved with workspace visibility.
   * This is the primary read path for the <ExtensionSlot> React component.
   * Results are Redis-cached per (tenantId, targetPluginId, targetSlotId).
   *
   * Filtering (CODEX finding — US-003, FR-010, FR-026):
   *   - isActive === false  → excluded (plugin deactivated)
   *   - isVisible === false → excluded (workspace toggled off)
   *   - validationStatus !== 'valid' → excluded (unresolved slot / type mismatch)
   */
  async getContributionsForSlot(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    targetPluginId: string,
    targetSlotId: string,
    workspaceId?: string
  ): Promise<ResolvedContribution[]> {
    this.assertEnabled(tenantSettings);

    const filterContributions = (rows: ContributionWithVisibility[]): ResolvedContribution[] =>
      rows
        .filter((r) => r.isActive && r.isVisible && r.validationStatus === 'valid')
        .map(toResolvedContribution);

    // Cache only the non-workspace-scoped query (workspace adds per-user state)
    if (!workspaceId) {
      const cacheKey = contributionsCacheKey(tenantId, targetPluginId, targetSlotId);
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as ResolvedContribution[];
        } catch {
          // fall through
        }
      }

      const rows = await this.repo.getContributionsForSlot(tenantId, targetPluginId, targetSlotId);
      const resolved = filterContributions(rows);
      await this.redis.set(cacheKey, JSON.stringify(resolved), 'EX', cacheTtl());
      return resolved;
    }

    const rows = await this.repo.getContributionsForSlot(
      tenantId,
      targetPluginId,
      targetSlotId,
      workspaceId
    );
    return filterContributions(rows);
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  /**
   * Set workspace-level visibility for a contribution.
   */
  async setVisibility(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    workspaceId: string,
    contributionId: string,
    isVisible: boolean
  ) {
    this.assertEnabled(tenantSettings);

    const result = await this.repo.setVisibility(tenantId, workspaceId, contributionId, isVisible);

    // Invalidate slot cache entries that might reference this contribution
    await this.invalidateSlotCache(tenantId);

    return result;
  }

  // ── Entity Queries ────────────────────────────────────────────────────────

  async getEntities(tenantId: string, tenantSettings: Record<string, unknown>) {
    this.assertEnabled(tenantSettings);
    return this.repo.getEntities(tenantId);
  }

  // ── Data Extension Aggregation ────────────────────────────────────────────

  /**
   * Aggregate sidecar data from all contributing plugins for a single entity.
   * Uses Promise.allSettled — partial failures produce warnings, not errors.
   * Timeout per sidecar fetch: 3 seconds.
   *
   * FR-031: Returns AggregatedExtensionData with contributors + warnings.
   */
  async aggregateEntityExtensions(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    targetPluginId: string,
    targetEntityType: string,
    entityId: string
  ): Promise<AggregatedExtensionData> {
    this.assertEnabled(tenantSettings);

    const dataExtensions = await this.repo.getDataExtensions(
      tenantId,
      targetPluginId,
      targetEntityType
    );

    if (dataExtensions.length === 0) {
      return {
        pluginId: targetPluginId,
        entityType: targetEntityType,
        entityId,
        fields: {},
        contributors: [],
        warnings: [],
      };
    }

    // Fetch from each sidecar URL; allSettled never throws
    const results = await Promise.allSettled(
      dataExtensions.map(async (ext: { sidecarUrl: string; contributingPluginId: string }) => {
        // SSRF guard: validate URL at fetch-time as defence-in-depth
        // (also validated at upsert-time in the schema layer)
        const safeBase = assertSafeUrl(ext.sidecarUrl);
        safeBase.searchParams.set('entityId', entityId);
        const url = safeBase.toString();

        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), SIDECAR_FETCH_TIMEOUT_MS);

        try {
          const res = await fetch(url, {
            signal: controller.signal,
            headers: {
              // Inject tenant context so sidecar plugins can enforce isolation
              'X-Tenant-ID': tenantId,
              'X-Plugin-ID': ext.contributingPluginId,
              'X-Entity-ID': entityId,
            },
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data = (await res.json()) as Record<string, unknown>;
          return { pluginId: ext.contributingPluginId, data };
        } finally {
          clearTimeout(timeoutHandle);
        }
      })
    );

    const fields: Record<string, unknown> = {};
    const contributors: string[] = [];
    const warnings: AggregatedExtensionData['warnings'] = [];

    (
      results as PromiseSettledResult<{ pluginId: string; data: Record<string, unknown> }>[]
    ).forEach((result, i) => {
      const ext = dataExtensions[i] as { contributingPluginId: string };
      if (result.status === 'fulfilled') {
        // Field collision detection (OPUS F-006): warn when two plugins define the same key
        const incoming = result.value.data;
        const colliding = Object.keys(incoming).filter((k) => k in fields);
        if (colliding.length > 0) {
          warnings.push({
            pluginId: ext.contributingPluginId,
            reason: 'field_collision',
            message: `Fields already contributed by another plugin: ${colliding.join(', ')}`,
          });
          this.log.warn(
            { tenantId, pluginId: ext.contributingPluginId, colliding },
            'sidecar field collision detected'
          );
        }
        Object.assign(fields, incoming);
        contributors.push(ext.contributingPluginId);
      } else {
        const err = result.reason as Error;
        const isTimeout = err.name === 'AbortError';
        this.log.warn(
          { tenantId, pluginId: ext.contributingPluginId, entityId, error: err.message },
          'sidecar data fetch failed'
        );
        warnings.push({
          pluginId: ext.contributingPluginId,
          reason: isTimeout ? 'timeout' : 'error',
          message: err.message,
        });
      }
    });

    return {
      pluginId: targetPluginId,
      entityType: targetEntityType,
      entityId,
      fields,
      contributors,
      warnings,
    };
  }

  // ── Slot Dependents ────────────────────────────────────────────────────────

  async getSlotDependents(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    targetPluginId: string,
    targetSlotId: string
  ): Promise<DependentsResult> {
    this.assertEnabled(tenantSettings);
    return this.repo.getSlotDependents(tenantId, targetPluginId, targetSlotId);
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  async validateContributions(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    pluginId: string
  ): Promise<ValidationResult[]> {
    this.assertEnabled(tenantSettings);
    return this.repo.validateContributions(tenantId, pluginId);
  }

  // ── Cache Helpers ──────────────────────────────────────────────────────────

  private async invalidateSlotCache(tenantId: string): Promise<void> {
    try {
      // Delete the unfiltered slots cache key
      await this.redis.del(slotsCacheKey(tenantId));

      // Pattern-delete all contribution cache keys for this tenant.
      // We use SCAN with a cursor (non-blocking O(1) per call) instead of KEYS
      // (O(N) blocking scan on the entire keyspace) — F-005 fix.
      const pattern = `ext:contributions:${tenantId}:*`;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length) await this.redis.del(...(keys as [string, ...string[]]));
      } while (cursor !== '0');
    } catch (err) {
      this.log.warn({ tenantId, err }, 'extension-registry: cache invalidation failed (non-fatal)');
    }
  }
}

// ---------------------------------------------------------------------------
// Local mapping helper
// ---------------------------------------------------------------------------

function toResolvedContribution(row: ContributionWithVisibility): ResolvedContribution {
  return {
    id: row.id,
    contributingPluginId: row.contributingPluginId,
    contributingPluginName: row.contributingPluginId, // Name resolved separately if needed
    targetPluginId: row.targetPluginId,
    targetSlotId: row.targetSlotId,
    componentName: row.componentName,
    priority: row.priority,
    validationStatus: row.validationStatus,
    previewUrl: row.previewUrl ?? undefined,
    isVisible: row.isVisible,
    isActive: row.isActive,
  };
}

// Singleton
export const extensionRegistryService = new ExtensionRegistryService();
