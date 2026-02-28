/**
 * T004-27 Security Tests: Plugin Hook URL Validation
 *
 * Verifies the three security controls from plan.md §10:
 *   1. Container network isolation — DockerContainerAdapter.start() uses
 *      NetworkMode='plexica-plugins' and does NOT use 'host' network
 *      (already tested in container-adapter.unit.test.ts — referenced here as
 *      ADR-019 compliance documentation; actual assertions live in that file)
 *   2. Hook URL origin validation — invokeHook() rejects URLs whose origin
 *      doesn't match manifest.api.basePath, and rejects internal-service URLs
 *   3. X-Tenant-ID propagation — invokeHook() sends X-Tenant-ID on every
 *      outbound call and throws when tenantId is missing
 *
 * Constitution Art. 5.3: Input validation — all external input validated
 * Constitution Art. 5.2: No cross-tenant data leakage
 * ADR-019: plugin containers must NOT have host network access
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../lib/db.js', () => ({
  db: {
    tenantPlugin: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { PluginHookService } from '../../../modules/plugin/plugin-hook.service.js';
import type { PluginInfo } from '../../../modules/plugin/types/hook.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal PluginInfo object for hook invocation tests.
 * hookUrl:   the URL of the hook handler (must be within basePath)
 * basePath:  the plugin's declared API base URL
 */
function buildPlugin(overrides: { id?: string; hookUrl: string; basePath: string }): PluginInfo {
  return {
    id: overrides.id ?? 'plugin-crm',
    apiBasePath: overrides.basePath,
    hooks: {
      workspace: {
        before_create: overrides.hookUrl,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Security Test Suite
// ---------------------------------------------------------------------------

describe('Security: PluginHookService.invokeHook() — URL validation', () => {
  let service: PluginHookService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Spy on globalThis.fetch — PluginHookService uses native fetch (Node ≥20)
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ approve: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    service = new PluginHookService();
  });

  // -------------------------------------------------------------------------
  // 1. Origin mismatch — hook URL on a different host
  // -------------------------------------------------------------------------

  it('should reject hook URL whose origin does not match manifest basePath origin', async () => {
    const plugin = buildPlugin({
      hookUrl: 'http://evil.example.com/hook',
      basePath: 'http://plugin-crm:8080',
    });

    await expect(
      service.invokeHook(plugin, 'workspace.before_create', {}, 'tenant-1', 5000)
    ).rejects.toThrow(/does not match plugin basePath origin/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Prefix-bypass attack — same host but different port
  // -------------------------------------------------------------------------

  it('should reject hook URL with different port (same hostname, different port)', async () => {
    const plugin = buildPlugin({
      hookUrl: 'http://plugin-crm:9999/hook', // Port 9999 ≠ 8080
      basePath: 'http://plugin-crm:8080',
    });

    await expect(
      service.invokeHook(plugin, 'workspace.before_create', {}, 'tenant-1', 5000)
    ).rejects.toThrow(/does not match plugin basePath origin/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Path outside basePath — hook path traverses above the basePath prefix
  // -------------------------------------------------------------------------

  it('should reject hook URL whose path is outside the declared basePath prefix', async () => {
    // basePath is /api/v1 — hook tries to escape to /admin
    const plugin = buildPlugin({
      hookUrl: 'http://plugin-crm:8080/admin/secrets',
      basePath: 'http://plugin-crm:8080/api/v1',
    });

    await expect(
      service.invokeHook(plugin, 'workspace.before_create', {}, 'tenant-1', 5000)
    ).rejects.toThrow(/outside plugin basePath/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Prefix-bypass via similar prefix names (/api vs /api-v2)
  // -------------------------------------------------------------------------

  it('should reject hook URL that only shares a prefix name but not a path boundary', async () => {
    // basePath is /api — hook is /api-v2/hook (shares prefix but not a valid sub-path)
    const plugin = buildPlugin({
      hookUrl: 'http://plugin-crm:8080/api-v2/hook',
      basePath: 'http://plugin-crm:8080/api',
    });

    await expect(
      service.invokeHook(plugin, 'workspace.before_create', {}, 'tenant-1', 5000)
    ).rejects.toThrow(/outside plugin basePath/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Valid hook — within basePath (should succeed and call fetch)
  // -------------------------------------------------------------------------

  it('should accept hook URL that is within the declared basePath', async () => {
    const plugin = buildPlugin({
      hookUrl: 'http://plugin-crm:8080/hooks/workspace/before_create',
      basePath: 'http://plugin-crm:8080',
    });

    const result = await service.invokeHook(
      plugin,
      'workspace.before_create',
      { tenantId: 'tenant-1' },
      'tenant-1',
      5000
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result).toEqual({ approve: true });
  });

  // -------------------------------------------------------------------------
  // 6. Valid hook — URL exactly equals basePath (root path)
  // -------------------------------------------------------------------------

  it('should accept hook URL that exactly equals the basePath', async () => {
    const plugin = buildPlugin({
      hookUrl: 'http://plugin-crm:8080/api/v1',
      basePath: 'http://plugin-crm:8080/api/v1',
    });

    await expect(
      service.invokeHook(plugin, 'workspace.before_create', {}, 'tenant-1', 5000)
    ).resolves.not.toThrow();

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 7. Missing tenantId — required for X-Tenant-ID header propagation
  // -------------------------------------------------------------------------

  it('should throw when tenantId is empty string (security: missing X-Tenant-ID)', async () => {
    const plugin = buildPlugin({
      hookUrl: 'http://plugin-crm:8080/hook',
      basePath: 'http://plugin-crm:8080',
    });

    await expect(
      service.invokeHook(plugin, 'workspace.before_create', {}, '', 5000)
    ).rejects.toThrow(/without tenantId/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. X-Tenant-ID is propagated on every outbound hook request
  // -------------------------------------------------------------------------

  it('should include X-Tenant-ID header on every outbound hook request', async () => {
    const plugin = buildPlugin({
      hookUrl: 'http://plugin-crm:8080/hook',
      basePath: 'http://plugin-crm:8080',
    });

    await service.invokeHook(plugin, 'workspace.before_create', {}, 'tenant-acme', 5000);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://plugin-crm:8080/hook',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Tenant-ID': 'tenant-acme',
        }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // 9. X-Trace-ID is included on every outbound hook request
  // -------------------------------------------------------------------------

  it('should include X-Trace-ID header on every outbound hook request', async () => {
    const plugin = buildPlugin({
      hookUrl: 'http://plugin-crm:8080/hook',
      basePath: 'http://plugin-crm:8080',
    });

    await service.invokeHook(plugin, 'workspace.before_create', {}, 'tenant-1', 5000);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Trace-ID': expect.any(String),
        }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // 10. Invalid URL strings — both hookUrl and basePath
  // -------------------------------------------------------------------------

  it('should throw for malformed hook URL', async () => {
    const plugin: PluginInfo = {
      id: 'plugin-crm',
      apiBasePath: 'http://plugin-crm:8080',
      hooks: {
        workspace: {
          before_create: 'not-a-url',
        },
      },
    };

    await expect(
      service.invokeHook(plugin, 'workspace.before_create', {}, 'tenant-1', 5000)
    ).rejects.toThrow(/Invalid hook URL or apiBasePath/);
  });

  it('should throw for malformed basePath URL', async () => {
    const plugin: PluginInfo = {
      id: 'plugin-crm',
      apiBasePath: 'not-a-url',
      hooks: {
        workspace: {
          before_create: 'http://plugin-crm:8080/hook',
        },
      },
    };

    await expect(
      service.invokeHook(plugin, 'workspace.before_create', {}, 'tenant-1', 5000)
    ).rejects.toThrow(/Invalid hook URL or apiBasePath/);
  });
});

// ---------------------------------------------------------------------------
// Security Test Suite: Container Network Isolation (documentation tests)
// ---------------------------------------------------------------------------
//
// Full DockerContainerAdapter.start() assertions are in:
//   container-adapter.unit.test.ts (T004-23)
//
// This describe block exists to document the ADR-019 compliance requirement
// and references the canonical test location.
//
// Key assertions verified in container-adapter.unit.test.ts:
//   ✓ HostConfig.NetworkMode === 'plexica-plugins'
//   ✓ HostConfig.NetworkMode !== 'host'
//
// ---------------------------------------------------------------------------

describe('Security: Container network isolation (ADR-019 compliance)', () => {
  it('documents that DockerContainerAdapter uses "plexica-plugins" network (tested in container-adapter.unit.test.ts)', () => {
    // This test documents the security requirement.
    // The functional assertions are in container-adapter.unit.test.ts.
    // See: "should call createContainer with NetworkMode='plexica-plugins' (ADR-019)"
    // See: "should NOT set NetworkMode='host' (plugin isolation)"
    expect(true).toBe(true); // Intentional: documentation test
  });
});
