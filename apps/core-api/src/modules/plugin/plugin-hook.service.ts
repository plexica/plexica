// apps/core-api/src/modules/plugin/plugin-hook.service.ts
//
// HTTP-based plugin hook service for workspace lifecycle events.
// Implements Spec 011 Phase 3 — T011-14, FR-027–FR-033.
//
// Design:
//   • before_create  — sequential, fail-open (timeout/error = implicit approve)
//   • created        — parallel, fire-and-forget, failures logged WARN
//   • deleted        — parallel, fire-and-forget, failures logged WARN
//
// All hook URLs are validated to be within the plugin's declared apiBasePath
// (security: prevents plugins registering callbacks to external services).
//
// Uses Node.js ≥20 native fetch + AbortController for timeouts.
// No additional HTTP client dependency required (Constitution Art. 2.2).

import type { PrismaClient } from '@plexica/database';
import { db } from '../../lib/db.js';
import { logger as rootLogger } from '../../lib/logger.js';
import type { Logger } from 'pino';
import type {
  HookResult,
  HookResponse,
  BeforeCreatePayload,
  PluginInfo,
} from './types/hook.types.js';
import type { TenantContext } from '../../middleware/tenant-context.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum time to wait for a single plugin hook to respond (per NFR-005) */
const HOOK_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the hook URL for a given hookType from a PluginInfo object.
 * hookType is e.g. 'workspace.before_create', 'workspace.created'.
 */
function getHookUrl(plugin: PluginInfo, hookType: string): string | undefined {
  const [ns, name] = hookType.split('.');
  if (ns === 'workspace' && plugin.hooks?.workspace) {
    const wsHooks = plugin.hooks.workspace as Record<string, string | undefined>;
    return wsHooks[name];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * PluginHookService
 *
 * Discovers and invokes HTTP-based plugin hooks for workspace lifecycle events.
 * Injected into WorkspaceService to decouple hook logic from workspace CRUD.
 */
export class PluginHookService {
  private readonly db: PrismaClient;
  private readonly log: Logger;

  constructor(customDb?: PrismaClient, customLogger?: Logger) {
    this.db = customDb ?? db;
    this.log = customLogger ?? rootLogger;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Run all before_create hooks sequentially.
   *
   * If any enabled plugin returns { approve: false }, returns
   * { approved: false, reason, pluginId } immediately (short-circuit).
   * Timeout or network error → fail-open (implicit approve + warn log).
   *
   * Returns { approved: true } if no plugin objects, or all pass.
   */
  async runBeforeCreateHooks(
    workspaceData: BeforeCreatePayload,
    tenantCtx: TenantContext
  ): Promise<HookResult> {
    const subscribers = await this.getHookSubscribers(
      'workspace.before_create',
      tenantCtx.tenantId
    );

    for (const plugin of subscribers) {
      try {
        const response = await this.invokeHook(
          plugin,
          'workspace.before_create',
          {
            workspaceData,
            tenantId: tenantCtx.tenantId,
          },
          HOOK_TIMEOUT_MS
        );

        if (response.approve === false) {
          return {
            approved: false,
            reason: response.reason ?? 'Rejected by plugin',
            pluginId: plugin.id,
          };
        }
      } catch (error: unknown) {
        // Timeout or network error → fail-open (implicit approve)
        this.log.warn(
          { pluginId: plugin.id, hookType: 'workspace.before_create', error },
          'Hook invocation failed — proceeding (fail-open)'
        );
      }
    }

    return { approved: true };
  }

  /**
   * Fire-and-forget: invoke workspace.created hooks in parallel.
   * Does NOT block workspace creation. Failures logged at WARN.
   */
  runCreatedHooks(workspaceId: string, templateId: string | null, tenantCtx: TenantContext): void {
    this.getHookSubscribers('workspace.created', tenantCtx.tenantId)
      .then((subscribers) => {
        const promises = subscribers.map((plugin) =>
          this.invokeHook(
            plugin,
            'workspace.created',
            {
              workspaceId,
              templateId,
              tenantId: tenantCtx.tenantId,
            },
            HOOK_TIMEOUT_MS
          ).catch((error: unknown) => {
            this.log.warn(
              { pluginId: plugin.id, hookType: 'workspace.created', error },
              'Hook invocation failed — workspace creation unaffected'
            );
          })
        );
        return Promise.allSettled(promises);
      })
      .catch((error: unknown) => {
        this.log.error({ error }, 'Failed to discover hook subscribers for workspace.created');
      });
  }

  /**
   * Fire-and-forget: invoke workspace.deleted hooks in parallel.
   * Does NOT block workspace deletion. Failures logged at WARN.
   */
  runDeletedHooks(workspaceId: string, tenantCtx: TenantContext): void {
    this.getHookSubscribers('workspace.deleted', tenantCtx.tenantId)
      .then((subscribers) => {
        const promises = subscribers.map((plugin) =>
          this.invokeHook(
            plugin,
            'workspace.deleted',
            {
              workspaceId,
              tenantId: tenantCtx.tenantId,
            },
            HOOK_TIMEOUT_MS
          ).catch((error: unknown) => {
            this.log.warn(
              { pluginId: plugin.id, hookType: 'workspace.deleted', error },
              'Hook invocation failed — workspace deletion unaffected'
            );
          })
        );
        return Promise.allSettled(promises);
      })
      .catch((error: unknown) => {
        this.log.error({ error }, 'Failed to discover hook subscribers for workspace.deleted');
      });
  }

  /**
   * Query the DB for all enabled plugins (for this tenant) that have
   * declared a handler URL for the given hookType.
   *
   * Uses Prisma findMany — no raw SQL needed (global plugin table, not tenant-schema).
   */
  async getHookSubscribers(hookType: string, tenantId: string): Promise<PluginInfo[]> {
    // Fetch all plugins that are enabled for this tenant
    const tenantPlugins = await this.db.tenantPlugin.findMany({
      where: {
        tenantId,
        enabled: true,
      },
      include: {
        plugin: {
          select: {
            id: true,
            manifest: true,
          },
        },
      },
    });

    const subscribers: PluginInfo[] = [];

    for (const tp of tenantPlugins) {
      const manifest = tp.plugin.manifest as Record<string, unknown> | null;
      if (!manifest) continue;

      // Extract workspace hooks from manifest
      const hooks = manifest.hooks as Record<string, unknown> | undefined;
      const wsHooks = hooks?.workspace as Record<string, string | undefined> | undefined;

      // Determine the hook name from the hookType (e.g., 'workspace.before_create' → 'before_create')
      const [ns, name] = hookType.split('.');
      if (ns !== 'workspace' || !wsHooks || !wsHooks[name]) continue;

      // Determine apiBasePath: use first service baseUrl, or fall back to plugin id convention
      const api = manifest.api as Record<string, unknown> | undefined;
      const services = api?.services as Array<Record<string, unknown>> | undefined;
      const apiBasePath =
        (services?.[0]?.baseUrl as string | undefined) ?? `http://plugin-${tp.plugin.id}:8080`;

      subscribers.push({
        id: tp.plugin.id,
        apiBasePath,
        hooks: {
          workspace: wsHooks as {
            before_create?: string;
            created?: string;
            deleted?: string;
          },
        },
      });
    }

    return subscribers;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Invoke a single plugin hook via HTTP POST with a timeout.
   *
   * Validates the hook URL is within the plugin's declared apiBasePath (security).
   * Throws on non-2xx response, timeout, or URL outside basePath.
   *
   * @param plugin   - Plugin info (id, apiBasePath, hooks)
   * @param hookType - e.g. 'workspace.before_create'
   * @param payload  - JSON body to send to the plugin
   * @param timeout  - Milliseconds before aborting (default HOOK_TIMEOUT_MS)
   */
  async invokeHook(
    plugin: PluginInfo,
    hookType: string,
    payload: object,
    timeout: number
  ): Promise<HookResponse> {
    const hookUrl = getHookUrl(plugin, hookType);
    if (!hookUrl) {
      throw new Error(`Plugin ${plugin.id} has no handler for ${hookType}`);
    }

    // Security: validate hook URL is within the plugin's declared basePath
    if (!hookUrl.startsWith(plugin.apiBasePath)) {
      throw new Error(`Hook URL ${hookUrl} is outside plugin basePath ${plugin.apiBasePath}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const payloadWithTenant = payload as Record<string, unknown>;
    const tenantId =
      (payloadWithTenant.tenantId as string | undefined) ??
      ((payloadWithTenant.workspaceData as Record<string, unknown> | undefined)?.tenantId as
        | string
        | undefined) ??
      '';

    try {
      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
          'X-Trace-ID': crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Hook returned ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as HookResponse;
    } finally {
      clearTimeout(timer);
    }
  }
}

// Singleton — re-used by WorkspaceService default constructor
export const pluginHookService = new PluginHookService();
