// File: apps/core-api/src/modules/extension-registry/extension-registry.service.ts
//
// Spec 013 — Extension Points (T013-06)
// Business logic layer for the Extension Registry.
// All data access goes through ExtensionRegistryRepository (ADR-031 Safeguard 1).
//
// Feature flag: extension_points_enabled must be true in tenant settings (Art. 9.1.1).
// Redis cache: TTL = 120s ± random(0..30)s jitter (plan.md §4.7).
// Sidecar aggregation: Promise.allSettled — never throws on partial failure.

import * as dns from 'node:dns/promises';
import { Agent as UndiciAgent } from 'undici';
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
import {
  isExtensionPointsEnabled,
  ContributionDeclarationSchema,
  ExtensibleEntityDeclarationSchema,
  DataExtensionDeclarationSchema,
} from './extension-registry.schema.js';
import { logger as rootLogger } from '../../lib/logger.js';
import { redis as defaultRedis } from '../../lib/redis.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_BASE_TTL_S = 120;
const CACHE_TTL_JITTER_MAX_S = 30;
const SIDECAR_FETCH_TIMEOUT_MS = 3_000; // fail-fast on slow plugin containers

// SSRF protection: validate that a sidecar URL does not resolve to an internal
// or cloud-metadata address.
//
// C-03 fix: Regex-only hostname matching was bypassable via decimal/octal/hex IP
// notation, full-form IPv6, and DNS rebinding. We now perform the check in two
// layers:
//
//   Layer 1 (syntactic): reject obviously blocked hostname literals before DNS.
//   Layer 2 (resolved):  resolve the hostname via dns.lookup and validate the
//                        returned IP against denied CIDR ranges. Pinning the
//                        resolved IP to the fetch request prevents DNS rebinding.
//
// No new npm dependency is added (Constitution Art. 2.2). CIDR matching is
// implemented inline using Node's built-in net module integer arithmetic.
import * as net from 'node:net';

/** Converts a dotted-decimal IPv4 string to a 32-bit unsigned integer. */
function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

/**
 * Returns true if `ip` (dotted-decimal) falls within the CIDR block described
 * by `cidrBase` (dotted-decimal) and `prefixLen`.
 */
function ipv4InCidr(ip: string, cidrBase: string, prefixLen: number): boolean {
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(cidrBase) & mask);
}

/** Deny-list of IPv4 CIDR ranges that must never be sidecar targets. */
const BLOCKED_IPV4_CIDRS: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // RFC-1918 class A
  ['100.64.0.0', 10], // CGNAT (RFC-6598)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local / AWS IMDS
  ['172.16.0.0', 12], // RFC-1918 class B
  ['192.168.0.0', 16], // RFC-1918 class C
  ['198.18.0.0', 15], // benchmarking (RFC-2544)
  ['203.0.113.0', 24], // documentation TEST-NET-3
  ['240.0.0.0', 4], // reserved
  ['255.255.255.255', 32],
];

/**
 * Returns true if the IPv6 address string should be blocked.
 * Handles: loopback (::1), link-local (fe80::/10), ULA (fc00::/7),
 * and IPv4-mapped (::ffff:x.x.x.x).
 */
function isBlockedIPv6(addr: string): boolean {
  const a = addr.toLowerCase().replace(/^\[|\]$/g, '');
  if (a === '::1') return true;
  if (a.startsWith('fe80:')) return true;
  if (a.startsWith('fc') || a.startsWith('fd')) return true;
  if (a.startsWith('::ffff:')) return true;
  return false;
}

/** Blocked hostname literals (checked before DNS resolution). */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
  'instance-data',
]);

/**
 * Returns true if the raw address string is blocked (supports any notation
 * including decimal, octal, hex, and shorthand IPv4).
 * Uses Node's net.isIP to normalise, then delegates to the CIDR check.
 *
 * This is the Layer-2 (post-resolution) check: `resolvedIp` comes from
 * `dns.lookup`, so it is always in normal dotted-decimal/colon notation.
 */
function isBlockedResolvedIp(resolvedIp: string): boolean {
  if (net.isIPv4(resolvedIp)) {
    return BLOCKED_IPV4_CIDRS.some(([base, prefix]) => ipv4InCidr(resolvedIp, base, prefix));
  }
  if (net.isIPv6(resolvedIp)) {
    return isBlockedIPv6(resolvedIp);
  }
  return true; // unknown format — block by default
}

/**
 * Validates a sidecarUrl string against SSRF risks.
 * Returns a { safeUrl, resolvedIp } tuple so the caller can pin the resolved IP
 * to the actual HTTP request (prevents DNS rebinding between validation and fetch).
 *
 * Throws an error (code: SSRF_BLOCKED) if the URL is unsafe.
 *
 * Rules:
 *  1. Must be http or https scheme only.
 *  2. Hostname must not be a known IMDS alias (checked before DNS).
 *  3. Resolved IP must not fall in any private/loopback/link-local/IMDS range.
 */
async function assertSafeUrl(
  rawUrl: string,
  fieldName = 'sidecarUrl'
): Promise<{ safeUrl: URL; resolvedIp: string }> {
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

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Layer 1: syntactic check before DNS (fast path for obvious cases)
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw Object.assign(new Error(`SSRF_BLOCKED: ${fieldName} targets a blocked hostname`), {
      code: 'SSRF_BLOCKED',
    });
  }

  // Layer 2: resolve hostname and validate the IP
  let resolvedIp: string;
  try {
    const result = await dns.lookup(hostname, { verbatim: true });
    resolvedIp = result.address;
  } catch {
    throw Object.assign(new Error(`SSRF_BLOCKED: ${fieldName} hostname could not be resolved`), {
      code: 'SSRF_BLOCKED',
    });
  }

  if (isBlockedResolvedIp(resolvedIp)) {
    throw Object.assign(
      new Error(`SSRF_BLOCKED: ${fieldName} resolves to a blocked address (${resolvedIp})`),
      { code: 'SSRF_BLOCKED' }
    );
  }

  return { safeUrl: parsed, resolvedIp };
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
    if (contributions.length) {
      // M-03: validate previewUrl (and other fields) before writing to DB.
      // Invalid contributions are skipped with a warning rather than hard-failing
      // the entire manifest sync, to avoid breaking plugin activation for one bad field.
      const validatedContributions = contributions.flatMap((c) => {
        const result = ContributionDeclarationSchema.safeParse(c);
        if (!result.success) {
          this.log.warn(
            { tenantId, pluginId, componentName: c.componentName, errors: result.error.issues },
            '[syncManifest] contribution validation failed — skipping'
          );
          return [];
        }
        return [result.data];
      });
      if (validatedContributions.length) {
        await this.repo.upsertContributions(tenantId, pluginId, validatedContributions);
      }
    }
    if (entities.length) {
      // C-04 fix: validate entities before upsert (same skip-and-warn pattern as contributions).
      const validatedEntities = entities.flatMap((e) => {
        const result = ExtensibleEntityDeclarationSchema.safeParse(e);
        if (!result.success) {
          this.log.warn(
            {
              tenantId,
              pluginId,
              entityType: (e as unknown as Record<string, unknown>)['entityType'],
              errors: result.error.issues,
            },
            '[syncManifest] entity declaration validation failed — skipping'
          );
          return [];
        }
        return [result.data];
      });
      if (validatedEntities.length)
        await this.repo.upsertEntities(tenantId, pluginId, validatedEntities);
    }
    if (dataExtensions.length) {
      // C-04 fix: validate dataExtensions before upsert — sidecarUrl is validated here
      // (format + scheme) so that malformed URLs never reach the database or the SSRF guard.
      const validatedDataExtensions = dataExtensions.flatMap((d) => {
        const result = DataExtensionDeclarationSchema.safeParse(d);
        if (!result.success) {
          this.log.warn(
            { tenantId, pluginId, errors: result.error.issues },
            '[syncManifest] dataExtension declaration validation failed — skipping'
          );
          return [];
        }
        return [result.data];
      });
      if (validatedDataExtensions.length)
        await this.repo.upsertDataExtensions(tenantId, pluginId, validatedDataExtensions);
    }

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
   * H-02 fix: invalidate slot cache after deactivation so stale contributions
   * are not served to <ExtensionSlot> components.
   */
  async onPluginDeactivated(tenantId: string, pluginId: string): Promise<void> {
    this.log.info({ tenantId, pluginId }, 'extension-registry: plugin deactivated');
    await this.repo.deactivateByPlugin(tenantId, pluginId);
    await this.invalidateSlotCache(tenantId);
  }

  /**
   * Called when a plugin is re-activated — restores all extension records.
   * tenantId required to scope the operation (ADR-031 Safeguard 2, F-002 fix).
   * H-02 fix: invalidate slot cache after reactivation so restored contributions
   * are visible immediately.
   */
  async onPluginReactivated(tenantId: string, pluginId: string): Promise<void> {
    this.log.info({ tenantId, pluginId }, 'extension-registry: plugin reactivated');
    await this.repo.reactivateByPlugin(tenantId, pluginId);
    await this.invalidateSlotCache(tenantId);
  }

  // ── Slot Queries ──────────────────────────────────────────────────────────

  /**
   * List extension slots for a tenant, with optional filters.
   * Results are cached with TTL jitter (only for un-filtered, first-page queries).
   */
  async getSlots(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    filters?: ExtensionSlotFilters,
    page = 1,
    pageSize = 50
  ) {
    this.assertEnabled(tenantSettings);

    // Only cache the un-filtered first-page listing
    if (!filters?.pluginId && !filters?.type && page === 1 && pageSize === 50) {
      const cacheKey = slotsCacheKey(tenantId);
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as Awaited<ReturnType<typeof this.repo.getSlots>>;
        } catch {
          // stale/corrupt cache — fall through to DB
        }
      }

      const slots = await this.repo.getSlots(tenantId, filters, page, pageSize);
      await this.redis.set(cacheKey, JSON.stringify(slots), 'EX', cacheTtl());
      return slots;
    }

    return this.repo.getSlots(tenantId, filters, page, pageSize);
  }

  /**
   * List slots for a specific plugin.
   */
  async getSlotsByPlugin(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    pluginId: string,
    page = 1,
    pageSize = 50
  ) {
    this.assertEnabled(tenantSettings);
    return this.repo.getSlotsByPlugin(tenantId, pluginId, page, pageSize);
  }

  // ── Contribution Queries ──────────────────────────────────────────────────

  /**
   * List contributions with optional filters.
   */
  async getContributions(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    filters?: ExtensionContributionFilters,
    page = 1,
    pageSize = 50
  ) {
    this.assertEnabled(tenantSettings);
    return this.repo.getContributions(tenantId, filters, page, pageSize);
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

  async getEntities(
    tenantId: string,
    tenantSettings: Record<string, unknown>,
    page = 1,
    pageSize = 50
  ) {
    this.assertEnabled(tenantSettings);
    return this.repo.getEntities(tenantId, page, pageSize);
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
        // SSRF guard: resolve hostname and validate the returned IP (C-03 fix).
        // assertSafeUrl resolves the hostname via dns.lookup and returns the
        // validated resolvedIp.  We MUST pin the actual TCP connection to that
        // IP — otherwise Node's fetch() would re-resolve DNS independently and
        // an attacker could exploit the TOCTOU window (DNS rebinding attack):
        //
        //   1. During assertSafeUrl() → DNS returns 203.0.113.1 (public IP) → passes
        //   2. TTL expires
        //   3. During fetch() → DNS returns 169.254.169.254 (IMDS) → bypass!
        //
        // Fix: use undici Agent with a custom connect hook that overrides the
        // hostname passed to the TCP layer, forcing the connection to resolvedIp
        // regardless of what DNS might return at connection time.
        // undici is bundled with Node.js 18+ — no new npm dependency needed
        // (Constitution Art. 2.2).
        const { safeUrl, resolvedIp } = await assertSafeUrl(ext.sidecarUrl);
        safeUrl.searchParams.set('entityId', entityId);
        const url = safeUrl.toString();

        // Create a one-shot undici Agent that pins the TCP destination to the
        // already-validated resolvedIp.  The Host header remains the original
        // hostname for SNI/virtual-hosting compatibility.
        const pinnedAgent = new UndiciAgent({
          connect: {
            // Override the hostname that undici passes to net.createConnection /
            // tls.connect — this is the actual IP that the socket will dial.
            lookup: (_hostname, _options, callback) => {
              callback(null, resolvedIp, resolvedIp.includes(':') ? 6 : 4);
            },
          },
        });

        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), SIDECAR_FETCH_TIMEOUT_MS);

        try {
          const res = await fetch(url, {
            // @ts-expect-error — Node 18+ fetch accepts dispatcher for undici Agent
            dispatcher: pinnedAgent,
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
          await pinnedAgent.close().catch(() => {});
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

  // ── Super Admin ────────────────────────────────────────────────────────────

  /**
   * SUPER_ADMIN ONLY: List all slots across all tenants.
   * W-12 fix: The boolean anti-pattern (isSuperAdmin parameter) has been removed.
   * Role verification now happens exclusively in the route layer, which reads
   * realm_access.roles from the verified Keycloak JWT and calls
   * authorizationService.isSuperAdmin() — returning 403 before this method is
   * ever called. The service no longer duplicates that check; callers are
   * trusted to have already enforced authorization at the route boundary.
   *
   * The explicit "superAdmin" method name is the defense-in-depth guard here
   * (ADR-031 Safeguard 3), making cross-tenant access visible at the call site.
   */
  async superAdminListAllSlots(page = 1, pageSize = 50) {
    return this.repo.superAdminListAllSlots(page, pageSize);
  }

  // ── Sync Status (W-8: operator observability) ────────────────────────────

  /** Redis key for sync status: `ext:sync:{tenantId}:{pluginId}` */
  private syncStatusKey(tenantId: string, pluginId: string): string {
    return `ext:sync:${tenantId}:${pluginId}`;
  }

  /**
   * Write sync status to Redis (TTL 3600s = 1 hour).
   * Called by the fire-and-forget block in plugin.service.ts before/after syncManifest.
   * Non-fatal: any Redis error is logged as a warning and swallowed.
   */
  async writeSyncStatus(
    tenantId: string,
    pluginId: string,
    status: 'syncing' | 'ok' | 'error',
    errorMessage?: string
  ): Promise<void> {
    try {
      const payload = JSON.stringify({
        status,
        ...(errorMessage !== undefined ? { error: errorMessage } : {}),
        ...(status === 'syncing' ? { startedAt: new Date().toISOString() } : {}),
        ...(status !== 'syncing' ? { completedAt: new Date().toISOString() } : {}),
      });
      await this.redis.set(this.syncStatusKey(tenantId, pluginId), payload, 'EX', 3600);
    } catch (err) {
      this.log.warn(
        { tenantId, pluginId, err },
        'extension-registry: failed to write sync status (non-fatal)'
      );
    }
  }

  /**
   * Read sync status from Redis for operator observability.
   * Returns null when no sync has been recorded yet.
   */
  async getSyncStatus(
    tenantId: string,
    pluginId: string
  ): Promise<{
    status: 'syncing' | 'ok' | 'error';
    error?: string;
    startedAt?: string;
    completedAt?: string;
  } | null> {
    try {
      const raw = await this.redis.get(this.syncStatusKey(tenantId, pluginId));
      if (!raw) return null;
      return JSON.parse(raw) as {
        status: 'syncing' | 'ok' | 'error';
        error?: string;
        startedAt?: string;
        completedAt?: string;
      };
    } catch {
      return null;
    }
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
    // W-04 fix: use the name resolved by the repo's plugin join instead of falling back to ID
    contributingPluginName: row.contributingPluginName,
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
