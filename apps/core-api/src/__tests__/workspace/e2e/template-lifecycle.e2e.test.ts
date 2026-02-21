/**
 * E2E Tests: Template & Plugin Lifecycle — Spec 011 Phase 2
 *
 * Tests the template and workspace plugin services directly against a real
 * PostgreSQL database (direct service calls, no HTTP layer).
 *
 * Scenarios:
 *   1. Template list is empty for a new tenant (no tenant plugins enabled)
 *   2. getTemplate returns TEMPLATE_NOT_FOUND for an unknown UUID
 *   3. Plugin enable → list → disable full lifecycle
 *   4. Plugin updateConfig persists the new configuration
 *   5. cascadeDisableForTenantPlugin disables all workspace plugins when
 *      a tenant-level plugin is disabled
 *
 * Requirements: PostgreSQL must be running (docker-compose up -d postgres)
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../lib/db.js';
import { testDb } from '../../../../../../test-infrastructure/helpers/test-database.helper.js';
import { WorkspaceService } from '../../../modules/workspace/workspace.service.js';
import { WorkspacePluginService } from '../../../modules/workspace/workspace-plugin.service.js';
import { WorkspaceTemplateService } from '../../../modules/workspace/workspace-template.service.js';
import {
  WorkspaceError,
  WorkspaceErrorCode,
} from '../../../modules/workspace/utils/error-formatter.js';
import { tenantContextStorage, type TenantContext } from '../../../middleware/tenant-context.js';

describe('Template & Plugin Lifecycle E2E', () => {
  let workspaceService: WorkspaceService;
  let pluginService: WorkspacePluginService;
  let templateService: WorkspaceTemplateService;

  let testTenantId: string;
  let testUserId: string;
  let tenantSlug: string;
  let schemaName: string;
  let tenantContext: TenantContext;

  const TEST_PLUGIN_ID = `e2e-plugin-${Date.now()}`;
  const createdWorkspaceIds: string[] = [];

  // ── run inside tenant context ──────────────────────────────────────────────

  function runInContext<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContextStorage.run(tenantContext, fn);
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    workspaceService = new WorkspaceService();
    pluginService = new WorkspacePluginService();
    templateService = new WorkspaceTemplateService();

    const suffix = Date.now();
    tenantSlug = `tmpl-e2e-${suffix}`;

    const tenant = await db.tenant.create({
      data: { slug: tenantSlug, name: 'Template Lifecycle E2E Tenant', status: 'ACTIVE' },
    });
    testTenantId = tenant.id;
    schemaName = await testDb.createTenantSchema(tenantSlug);

    const user = await db.user.create({
      data: {
        email: `tmpl-e2e-${suffix}@example.com`,
        firstName: 'Template',
        lastName: 'Tester',
        keycloakId: `kc-tmpl-e2e-${suffix}`,
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

    tenantContext = { tenantId: testTenantId, tenantSlug, schemaName };
  });

  afterAll(async () => {
    try {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } catch {
      /* ignore */
    }
    try {
      await db.user.deleteMany({ where: { keycloakId: { startsWith: 'kc-tmpl-e2e-' } } });
      await db.tenant.delete({ where: { id: testTenantId } });
    } catch {
      /* ignore */
    }
    try {
      // Clean up global tables written by the plugin lifecycle tests
      await db.$executeRaw`DELETE FROM workspace_plugins WHERE plugin_id = ${TEST_PLUGIN_ID}`;
      await db.$executeRaw`DELETE FROM tenant_plugins WHERE "pluginId" = ${TEST_PLUGIN_ID}`;
    } catch {
      /* ignore */
    }
    await db.$disconnect();
  });

  // ── Test 1: empty template list ────────────────────────────────────────────

  it('should return empty template list when no tenant plugins are enabled', async () => {
    const templates = await templateService.listTemplates(testTenantId);
    expect(templates).toEqual([]);
  });

  // ── Test 2: getTemplate → TEMPLATE_NOT_FOUND ───────────────────────────────

  it('should throw TEMPLATE_NOT_FOUND for an unknown template UUID', async () => {
    const unknownId = '00000000-0000-4000-a000-000000000000';
    const error = await templateService
      .getTemplate(unknownId, testTenantId)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WorkspaceError);
    expect((error as WorkspaceError).code).toBe(WorkspaceErrorCode.TEMPLATE_NOT_FOUND);
    expect((error as WorkspaceError).statusCode).toBe(404);
  });

  // ── Test 3: plugin enable → list → disable lifecycle ──────────────────────

  describe('Plugin enable → list → disable lifecycle', () => {
    let workspaceId: string;

    beforeAll(async () => {
      // Create a workspace to attach plugins to
      const ws = await runInContext(() =>
        workspaceService.create(
          { slug: `plugin-lifecycle-${Date.now()}`, name: 'Plugin Lifecycle Workspace' },
          testUserId
        )
      );
      workspaceId = ws.id;
      createdWorkspaceIds.push(workspaceId);

      // Register the plugin at tenant level so enablePlugin doesn't reject it
      await db.$executeRaw`
        INSERT INTO tenant_plugins ("tenantId", "pluginId", enabled, configuration, installed_at)
        VALUES (${testTenantId}, ${TEST_PLUGIN_ID}, true, '{}'::jsonb, NOW())
        ON CONFLICT ("tenantId", "pluginId") DO NOTHING
      `;
    });

    it('should enable a plugin and return it in the list', async () => {
      // Enable
      const row = await pluginService.enablePlugin(
        workspaceId,
        TEST_PLUGIN_ID,
        { initial: true },
        tenantContext
      );

      expect(row.workspace_id).toBe(workspaceId);
      expect(row.plugin_id).toBe(TEST_PLUGIN_ID);
      expect(row.enabled).toBe(true);
      expect(row.configuration).toEqual({ initial: true });

      // List
      const list = await pluginService.listPlugins(workspaceId, tenantContext);
      expect(list.some((r) => r.plugin_id === TEST_PLUGIN_ID && r.enabled)).toBe(true);
    });

    it('should disable the plugin and reflect enabled=false', async () => {
      await pluginService.disablePlugin(workspaceId, TEST_PLUGIN_ID, tenantContext);

      const list = await pluginService.listPlugins(workspaceId, tenantContext);
      const record = list.find((r) => r.plugin_id === TEST_PLUGIN_ID);
      expect(record).toBeDefined();
      expect(record!.enabled).toBe(false);
    });
  });

  // ── Test 4: updateConfig persists new configuration ───────────────────────

  describe('Plugin updateConfig persists new configuration', () => {
    let workspaceId: string;

    beforeAll(async () => {
      const ws = await runInContext(() =>
        workspaceService.create(
          { slug: `update-config-${Date.now()}`, name: 'Update Config Workspace' },
          testUserId
        )
      );
      workspaceId = ws.id;
      createdWorkspaceIds.push(workspaceId);

      // Ensure tenant plugin exists (may already exist from Test 3)
      await db.$executeRaw`
        INSERT INTO tenant_plugins ("tenantId", "pluginId", enabled, configuration, installed_at)
        VALUES (${testTenantId}, ${TEST_PLUGIN_ID}, true, '{}'::jsonb, NOW())
        ON CONFLICT ("tenantId", "pluginId") DO NOTHING
      `;

      // Enable plugin with initial config
      await pluginService.enablePlugin(workspaceId, TEST_PLUGIN_ID, { v: 1 }, tenantContext);
    });

    it('should update the config and read back the new values', async () => {
      const updated = await pluginService.updateConfig(
        workspaceId,
        TEST_PLUGIN_ID,
        { v: 2, extra: 'hello' },
        tenantContext
      );

      expect(updated.configuration).toEqual({ v: 2, extra: 'hello' });

      // Cross-check via listPlugins
      const list = await pluginService.listPlugins(workspaceId, tenantContext);
      const record = list.find((r) => r.plugin_id === TEST_PLUGIN_ID);
      expect(record?.configuration).toEqual({ v: 2, extra: 'hello' });
    });
  });

  // ── Test 5: cascade disable ────────────────────────────────────────────────

  describe('cascadeDisableForTenantPlugin disables all workspace plugins', () => {
    let wsId1: string;
    let wsId2: string;

    beforeAll(async () => {
      const CASCADE_PLUGIN_ID = `cascade-plugin-${Date.now()}`;

      // Create two workspaces
      const ws1 = await runInContext(() =>
        workspaceService.create(
          { slug: `cascade-ws1-${Date.now()}`, name: 'Cascade Workspace 1' },
          testUserId
        )
      );
      wsId1 = ws1.id;
      createdWorkspaceIds.push(wsId1);

      const ws2 = await runInContext(() =>
        workspaceService.create(
          { slug: `cascade-ws2-${Date.now()}`, name: 'Cascade Workspace 2' },
          testUserId
        )
      );
      wsId2 = ws2.id;
      createdWorkspaceIds.push(wsId2);

      // Register cascade plugin at tenant level
      await db.$executeRaw`
        INSERT INTO tenant_plugins ("tenantId", "pluginId", enabled, configuration, installed_at)
        VALUES (${testTenantId}, ${CASCADE_PLUGIN_ID}, true, '{}'::jsonb, NOW())
        ON CONFLICT ("tenantId", "pluginId") DO NOTHING
      `;

      const ctx = tenantContext;

      // Enable the plugin in both workspaces
      await pluginService.enablePlugin(wsId1, CASCADE_PLUGIN_ID, {}, ctx);
      await pluginService.enablePlugin(wsId2, CASCADE_PLUGIN_ID, {}, ctx);

      // Now simulate tenant-level disable: cascade-disable all workspace plugins
      const affected = await pluginService.cascadeDisableForTenantPlugin(
        CASCADE_PLUGIN_ID,
        testTenantId
      );

      expect(affected).toBeGreaterThanOrEqual(2);
    });

    it('should have disabled the plugin in workspace 1', async () => {
      const list = await pluginService.listPlugins(wsId1, tenantContext);
      // The cascade-disabled plugin should not appear as enabled
      const enabledPlugins = list.filter((r) => r.enabled);
      expect(enabledPlugins.length).toBeLessThan(list.length);
    });

    it('should have disabled the plugin in workspace 2', async () => {
      const list = await pluginService.listPlugins(wsId2, tenantContext);
      // None of the records should be enabled (they were just cascade-disabled)
      expect(list.every((r) => !r.enabled)).toBe(true);
    });
  });
});
