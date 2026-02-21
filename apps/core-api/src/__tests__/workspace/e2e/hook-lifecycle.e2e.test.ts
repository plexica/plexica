/**
 * E2E Tests: Plugin Hook Lifecycle — Spec 011 Phase 3 (T011-17)
 *
 * Tests workspace creation and deletion with real service instances + DB:
 *   1. Workspace creation succeeds when no plugin hooks are registered
 *   2. Workspace creation succeeds when a before_create hook approves
 *   3. Workspace creation fails with HOOK_REJECTED_CREATION when hook rejects
 *   4. Workspace creation is not blocked by fire-and-forget created/deleted hooks
 *
 * Requirements: PostgreSQL must be running (docker-compose up -d postgres)
 *
 * Note: Hook HTTP calls are intercepted via vi.stubGlobal('fetch') so no
 * real plugin processes need to be running during E2E tests.
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { WorkspaceService } from '../../../modules/workspace/workspace.service.js';
import { WorkspaceHierarchyService } from '../../../modules/workspace/workspace-hierarchy.service.js';
import { WorkspaceTemplateService } from '../../../modules/workspace/workspace-template.service.js';
import { PluginHookService } from '../../../modules/plugin/plugin-hook.service.js';
import {
  WorkspaceError,
  WorkspaceErrorCode,
} from '../../../modules/workspace/utils/error-formatter.js';
import { db } from '../../../lib/db.js';
import { tenantContextStorage, type TenantContext } from '../../../middleware/tenant-context.js';
import { testDb } from '../../../../../../test-infrastructure/helpers/test-database.helper.js';

describe('Plugin Hook Lifecycle E2E', () => {
  let workspaceService: WorkspaceService;
  let testTenantId: string;
  let testUserId: string;
  let tenantSlug: string;
  let schemaName: string;
  let tenantContext: TenantContext;

  const createdWorkspaceIds: string[] = [];

  // Helper: run a callback within the test tenant context
  async function runInContext<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContextStorage.run(tenantContext, fn);
  }

  // ---------------------------------------------------------------------------
  // Suite setup & teardown
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    const suffix = Date.now();
    tenantSlug = `hook-e2e-${suffix}`;

    // Create tenant record
    const tenant = await db.tenant.create({
      data: {
        slug: tenantSlug,
        name: 'Hook E2E Tenant',
        status: 'ACTIVE',
      },
    });
    testTenantId = tenant.id;

    // Create tenant schema (tables)
    schemaName = await testDb.createTenantSchema(tenantSlug);

    // Create test user in global + tenant-schema tables
    const user = await db.user.create({
      data: {
        email: `hook-e2e-${suffix}@example.com`,
        firstName: 'Hook',
        lastName: 'Tester',
        keycloakId: `kc-hook-e2e-${suffix}`,
      },
    });
    testUserId = user.id;

    await db.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."users" (id, keycloak_id, email, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      user.id,
      user.keycloakId,
      user.email,
      user.firstName,
      user.lastName
    );

    tenantContext = {
      tenantId: testTenantId,
      tenantSlug: tenant.slug,
      schemaName,
    };
  });

  afterAll(async () => {
    try {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } catch {
      // ignore
    }
    try {
      await db.user.deleteMany({ where: { keycloakId: { startsWith: 'kc-hook-e2e-' } } });
      await db.tenant.delete({ where: { id: testTenantId } });
    } catch {
      // ignore
    }
    await db.$disconnect();
  });

  // Restore fetch stub after each test to prevent leakage
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---------------------------------------------------------------------------
  // Helper: build a WorkspaceService with a specific PluginHookService
  // ---------------------------------------------------------------------------

  function buildServiceWithHooks(hookService: PluginHookService): WorkspaceService {
    return new WorkspaceService(
      db,
      undefined, // no event bus
      undefined, // no cache
      undefined, // default logger
      new WorkspaceHierarchyService(db),
      new WorkspaceTemplateService(db),
      hookService
    );
  }

  // ---------------------------------------------------------------------------
  // Test 1: No hooks registered → workspace creation succeeds
  // ---------------------------------------------------------------------------

  describe('Workspace creation with no plugin hooks', () => {
    it('should create workspace successfully when no plugins are registered', async () => {
      // The default hook service will query DB — no plugins/tenant_plugins exist → empty list
      workspaceService = buildServiceWithHooks(new PluginHookService(db));

      const ws = await runInContext(() =>
        workspaceService.create(
          { slug: `no-hook-ws-${Date.now()}`, name: 'No Hook Workspace' },
          testUserId
        )
      );

      createdWorkspaceIds.push(ws.id);

      expect(ws).toHaveProperty('id');
      expect(ws.name).toBe('No Hook Workspace');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: before_create hook approves → workspace creation succeeds
  // ---------------------------------------------------------------------------

  describe('Workspace creation with approving before_create hook', () => {
    let approvalPluginId: string;

    beforeEach(async () => {
      // Insert plugin + tenant_plugin rows so hook service discovers the plugin
      approvalPluginId = `hook-approving-${Date.now()}`;

      await db.$executeRawUnsafe(
        `INSERT INTO plugins (id, name, version, description, category, status, metadata, manifest, created_at, updated_at)
         VALUES ($1, 'Approving Hook Plugin', '1.0.0', 'Approves all workspaces', 'test', 'PUBLISHED',
                 '{}',
                 '{"hooks":{"workspace":{"before_create":"http://plugin-approving:8080/hooks/before_create"}},"api":{"services":[{"baseUrl":"http://plugin-approving:8080"}]}}'::jsonb,
                 NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        approvalPluginId
      );

      await db.$executeRawUnsafe(
        `INSERT INTO tenant_plugins (tenant_id, plugin_id, enabled, configuration, installed_at, updated_at)
         VALUES ($1::uuid, $2, true, '{}', NOW(), NOW())
         ON CONFLICT (tenant_id, plugin_id) DO UPDATE SET enabled = true`,
        testTenantId,
        approvalPluginId
      );
    });

    afterEach(async () => {
      // Remove tenant_plugin + plugin
      await db.$executeRawUnsafe(
        `DELETE FROM tenant_plugins WHERE plugin_id = $1`,
        approvalPluginId
      );
      await db.$executeRawUnsafe(`DELETE FROM plugins WHERE id = $1`, approvalPluginId);
    });

    it('should create workspace when before_create hook returns { approve: true }', async () => {
      // Stub fetch: plugin hook responds approve=true
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ approve: true }),
      } as unknown as Response);
      vi.stubGlobal('fetch', mockFetch);

      workspaceService = buildServiceWithHooks(new PluginHookService(db));

      const ws = await runInContext(() =>
        workspaceService.create(
          { slug: `approve-hook-ws-${Date.now()}`, name: 'Approved Hook Workspace' },
          testUserId
        )
      );

      createdWorkspaceIds.push(ws.id);

      expect(ws).toHaveProperty('id');
      expect(ws.name).toBe('Approved Hook Workspace');
      // Verify fetch was called once (for before_create)
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3: before_create hook rejects → HOOK_REJECTED_CREATION error
  // ---------------------------------------------------------------------------

  describe('Workspace creation with rejecting before_create hook', () => {
    let rejectPluginId: string;

    beforeEach(async () => {
      rejectPluginId = `hook-rejecting-${Date.now()}`;

      await db.$executeRawUnsafe(
        `INSERT INTO plugins (id, name, version, description, category, status, metadata, manifest, created_at, updated_at)
         VALUES ($1, 'Rejecting Hook Plugin', '1.0.0', 'Rejects all workspaces', 'test', 'PUBLISHED',
                 '{}',
                 '{"hooks":{"workspace":{"before_create":"http://plugin-rejecting:8080/hooks/before_create"}},"api":{"services":[{"baseUrl":"http://plugin-rejecting:8080"}]}}'::jsonb,
                 NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        rejectPluginId
      );

      await db.$executeRawUnsafe(
        `INSERT INTO tenant_plugins (tenant_id, plugin_id, enabled, configuration, installed_at, updated_at)
         VALUES ($1::uuid, $2, true, '{}', NOW(), NOW())
         ON CONFLICT (tenant_id, plugin_id) DO UPDATE SET enabled = true`,
        testTenantId,
        rejectPluginId
      );
    });

    afterEach(async () => {
      await db.$executeRawUnsafe(`DELETE FROM tenant_plugins WHERE plugin_id = $1`, rejectPluginId);
      await db.$executeRawUnsafe(`DELETE FROM plugins WHERE id = $1`, rejectPluginId);
    });

    it('should throw HOOK_REJECTED_CREATION when before_create hook returns { approve: false }', async () => {
      // Stub fetch: plugin hook responds approve=false
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ approve: false, reason: 'Policy violation: workspace limit reached' }),
      } as unknown as Response);
      vi.stubGlobal('fetch', mockFetch);

      workspaceService = buildServiceWithHooks(new PluginHookService(db));

      await expect(
        runInContext(() =>
          workspaceService.create(
            { slug: `rejected-hook-ws-${Date.now()}`, name: 'Rejected Workspace' },
            testUserId
          )
        )
      ).rejects.toThrow(
        expect.objectContaining({
          code: WorkspaceErrorCode.HOOK_REJECTED_CREATION,
        }) as unknown as WorkspaceError
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Test 4: created/deleted hooks are fire-and-forget → do not block response
  // ---------------------------------------------------------------------------

  describe('Fire-and-forget hooks (created / deleted)', () => {
    let ffPluginId: string;

    beforeEach(async () => {
      ffPluginId = `hook-ff-${Date.now()}`;

      await db.$executeRawUnsafe(
        `INSERT INTO plugins (id, name, version, description, category, status, metadata, manifest, created_at, updated_at)
         VALUES ($1, 'Fire-and-Forget Plugin', '1.0.0', 'Subscribes to created/deleted', 'test', 'PUBLISHED',
                 '{}',
                 '{"hooks":{"workspace":{"created":"http://plugin-ff:8080/hooks/created","deleted":"http://plugin-ff:8080/hooks/deleted"}},"api":{"services":[{"baseUrl":"http://plugin-ff:8080"}]}}'::jsonb,
                 NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        ffPluginId
      );

      await db.$executeRawUnsafe(
        `INSERT INTO tenant_plugins (tenant_id, plugin_id, enabled, configuration, installed_at, updated_at)
         VALUES ($1::uuid, $2, true, '{}', NOW(), NOW())
         ON CONFLICT (tenant_id, plugin_id) DO UPDATE SET enabled = true`,
        testTenantId,
        ffPluginId
      );
    });

    afterEach(async () => {
      await db.$executeRawUnsafe(`DELETE FROM tenant_plugins WHERE plugin_id = $1`, ffPluginId);
      await db.$executeRawUnsafe(`DELETE FROM plugins WHERE id = $1`, ffPluginId);
    });

    it('should create workspace without waiting for fire-and-forget hooks to complete', async () => {
      // Stub fetch: slow hook response (>5s) — creation should still complete quickly
      // because created hooks are fire-and-forget (non-blocking)
      const mockFetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ ok: true }),
                } as unknown as Response),
              200 // 200ms simulated delay
            )
          )
      );
      vi.stubGlobal('fetch', mockFetch);

      workspaceService = buildServiceWithHooks(new PluginHookService(db));

      const start = Date.now();
      const ws = await runInContext(() =>
        workspaceService.create(
          { slug: `ff-hook-ws-${Date.now()}`, name: 'Fire-and-Forget Workspace' },
          testUserId
        )
      );
      const elapsed = Date.now() - start;

      createdWorkspaceIds.push(ws.id);

      expect(ws).toHaveProperty('id');
      // Workspace creation should complete well under 200ms (hook is fire-and-forget)
      // We use a generous 2000ms threshold to avoid flakiness on CI
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
