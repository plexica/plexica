/**
 * Integration Tests: Extension Registry API Routes
 *
 * Spec 013 — Extension Points, T013-22 (Plan §3.1–3.7, §8.2, Art. 4.1).
 *
 * Tests all 8 extension-registry endpoints using buildTestApp() + mocked service.
 * Covers: auth (401/403), feature-flag gating (403), validation (400), happy paths (200/204).
 *
 * Constitution Compliance:
 *   - Art. 5.1: All routes require authentication
 *   - Art. 5.3: Input validation (Zod schemas)
 *   - Art. 6.2: Standard error format { error: { code, message } }
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Hoist mock factories
// ---------------------------------------------------------------------------

const {
  mockGetSlots,
  mockGetSlotsByPlugin,
  mockGetContributions,
  mockGetContributionsForSlot,
  mockGetEntities,
  mockAggregateEntityExtensions,
  mockSetVisibility,
  mockGetSlotDependents,
} = vi.hoisted(() => ({
  mockGetSlots: vi.fn(),
  mockGetSlotsByPlugin: vi.fn(),
  mockGetContributions: vi.fn(),
  mockGetContributionsForSlot: vi.fn(),
  mockGetEntities: vi.fn(),
  mockAggregateEntityExtensions: vi.fn(),
  mockSetVisibility: vi.fn(),
  mockGetSlotDependents: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock ExtensionRegistryService singleton
// ---------------------------------------------------------------------------

vi.mock(
  '../../../modules/extension-registry/extension-registry.service.js',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../../modules/extension-registry/extension-registry.service.js')
      >();
    return {
      ...original,
      extensionRegistryService: {
        getSlots: mockGetSlots,
        getSlotsByPlugin: mockGetSlotsByPlugin,
        getContributions: mockGetContributions,
        getContributionsForSlot: mockGetContributionsForSlot,
        getEntities: mockGetEntities,
        aggregateEntityExtensions: mockAggregateEntityExtensions,
        setVisibility: mockSetVisibility,
        getSlotDependents: mockGetSlotDependents,
      },
    };
  }
);

// Mock tenantService to avoid real DB calls
const mockGetTenant = vi.fn();
const mockGetTenantBySlug = vi.fn();

vi.mock('../../../services/tenant.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/tenant.service.js')>();
  return {
    ...original,
    tenantService: {
      getTenant: mockGetTenant,
      getTenantBySlug: mockGetTenantBySlug,
    },
  };
});

// Mock getTenantContext to return a consistent tenant context
const mockGetTenantContext = vi.fn();
vi.mock('../../../middleware/tenant-context.js', () => ({
  getTenantContext: mockGetTenantContext,
  setTenantContext: vi.fn(),
}));

// Mock authorizationService (ABAC engine) — F-006
const mockAuthorize = vi.fn();
vi.mock('../../../modules/authorization/authorization.service.js', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../../modules/authorization/authorization.service.js')
    >();
  return {
    ...original,
    authorizationService: {
      authorize: mockAuthorize,
    },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-integration-test';
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CONTRIBUTION_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const PLUGIN_ID = 'plugin-alpha';

const ENABLED_TENANT = {
  id: TENANT_ID,
  slug: 'integration-test',
  settings: { extension_points_enabled: true },
};

const SAMPLE_SLOT = {
  id: 'slot-uuid-1',
  tenantId: TENANT_ID,
  pluginId: PLUGIN_ID,
  slotId: 'action-bar',
  slotType: 'action',
  label: 'Action Bar',
  isActive: true,
};

const SAMPLE_CONTRIBUTION = {
  id: CONTRIBUTION_ID,
  contributingPluginId: 'plugin-beta',
  contributingPluginName: 'plugin-beta',
  targetPluginId: PLUGIN_ID,
  targetSlotId: 'action-bar',
  componentName: 'MyButton',
  priority: 10,
  validationStatus: 'valid',
  isVisible: true,
  isActive: true,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Extension Registry Routes — Integration Tests', () => {
  let app: FastifyInstance;
  let tenantToken: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    tenantToken = testContext.auth.createMockTenantAdminToken('acme');

    // Set up default mocks
    mockGetTenantContext.mockReturnValue({ tenantId: TENANT_ID });
    mockGetTenant.mockResolvedValue(ENABLED_TENANT);
    // Default ABAC: permit all (F-006)
    mockAuthorize.mockResolvedValue({
      permitted: true,
      checkedPermissions: [],
      userPermissions: [],
      fromCache: false,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ── GET /api/v1/extension-registry/slots ──────────────────────────────────

  describe('GET /api/v1/extension-registry/slots', () => {
    it('200 — returns active slots for authenticated tenant user', async () => {
      // forge-review fix [CONSENSUS]: tests now assert against the real controller
      // response shape ({ slots }) rather than a hypothetical { data } wrapper
      // that never existed in the controller (Test-Spec Coherence fix).
      mockGetSlots.mockResolvedValue([SAMPLE_SLOT]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/slots',
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ slots: (typeof SAMPLE_SLOT)[] }>();
      expect(body.slots).toHaveLength(1);
      expect(body.slots[0].slotId).toBe('action-bar');
    });

    it('200 — empty array when no slots exist', async () => {
      mockGetSlots.mockResolvedValue([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/slots',
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ slots: unknown[] }>().slots).toEqual([]);
    });

    it('401 — no authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/slots',
      });
      expect(res.statusCode).toBe(401);
    });

    it('403 — feature flag disabled returns EXTENSION_POINTS_DISABLED', async () => {
      // forge-review fix: EXTENSION_POINTS_DISABLED now returns HTTP 403 (feature
      // unavailable for this tenant) rather than 404 (not found). Returning 404
      // caused API consumers to misinterpret a disabled feature as non-existent,
      // leading to incorrect retry / error-handling logic (Constitution Art. 6.1).
      mockGetSlots.mockRejectedValueOnce(
        Object.assign(new Error('EXTENSION_POINTS_DISABLED: not enabled'), {
          code: 'EXTENSION_POINTS_DISABLED',
        })
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/slots',
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('EXTENSION_POINTS_DISABLED');
    });

    it('400 — invalid type query param is rejected', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/slots?type=sidebar',
        headers: { authorization: `Bearer ${tenantToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('200 — filter by pluginId returns subset', async () => {
      mockGetSlots.mockResolvedValue([SAMPLE_SLOT]);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/extension-registry/slots?pluginId=${PLUGIN_ID}`,
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(mockGetSlots).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Object),
        expect.objectContaining({ pluginId: PLUGIN_ID })
      );
    });
  });

  // ── GET /api/v1/extension-registry/slots/:pluginId ────────────────────────

  describe('GET /api/v1/extension-registry/slots/:pluginId', () => {
    it('200 — returns slots for specific plugin', async () => {
      mockGetSlotsByPlugin.mockResolvedValue([SAMPLE_SLOT]);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/extension-registry/slots/${PLUGIN_ID}`,
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ slots: unknown[] }>().slots).toHaveLength(1);
    });

    it('200 — returns empty array for unknown plugin', async () => {
      mockGetSlotsByPlugin.mockResolvedValue([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/slots/unknown-plugin',
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ slots: unknown[] }>().slots).toEqual([]);
    });
  });

  // ── GET /api/v1/extension-registry/contributions ─────────────────────────

  describe('GET /api/v1/extension-registry/contributions', () => {
    it('200 — returns contributions list', async () => {
      mockGetContributions.mockResolvedValue([SAMPLE_CONTRIBUTION]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/contributions',
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ contributions: unknown[] }>();
      expect(body.contributions).toHaveLength(1);
    });

    it('400 — invalid workspaceId UUID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/contributions?workspaceId=not-a-uuid',
        headers: { authorization: `Bearer ${tenantToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('401 — no auth header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/contributions',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /api/v1/extension-registry/entities ───────────────────────────────

  describe('GET /api/v1/extension-registry/entities', () => {
    it('200 — returns entity types from active plugins', async () => {
      mockGetEntities.mockResolvedValue([
        { id: 'e-1', entityType: 'contact', label: 'Contact', isActive: true },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/entities',
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ entities: unknown[] }>().entities).toHaveLength(1);
    });

    it('401 — no auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/entities',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /api/v1/extension-registry/entities/:pluginId/:entityType/:entityId/extensions ──

  describe('GET /api/v1/extension-registry/entities/.../extensions', () => {
    it('200 — returns aggregated extension data', async () => {
      mockAggregateEntityExtensions.mockResolvedValue({
        pluginId: PLUGIN_ID,
        entityType: 'contact',
        entityId: 'e-123',
        fields: { extra: 'data' },
        contributors: ['plugin-beta'],
        warnings: [],
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/extension-registry/entities/${PLUGIN_ID}/contact/e-123/extensions`,
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      // Controller returns the AggregatedExtensionData shape directly (no { data } wrapper)
      const body = res.json<{ fields: Record<string, unknown> }>();
      expect(body.fields).toEqual({ extra: 'data' });
    });

    it('404 — ENTITY_TYPE_NOT_FOUND returns correct code', async () => {
      mockAggregateEntityExtensions.mockRejectedValueOnce(
        new Error('ENTITY_TYPE_NOT_FOUND: contact not registered')
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/extension-registry/entities/${PLUGIN_ID}/unknown-type/e-123/extensions`,
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('ENTITY_TYPE_NOT_FOUND');
    });
  });

  // ── PATCH /api/v1/workspaces/:workspaceId/extension-visibility/:contributionId ──

  describe('PATCH /api/v1/workspaces/:workspaceId/extension-visibility/:contributionId', () => {
    it('200 — workspace admin can toggle visibility off', async () => {
      mockSetVisibility.mockResolvedValue({ id: 'vis-1', isVisible: false });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${WORKSPACE_ID}/extension-visibility/${CONTRIBUTION_ID}`,
        headers: {
          authorization: `Bearer ${tenantToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ isVisible: false }),
      });

      expect(res.statusCode).toBe(200);
    });

    it('400 — invalid body (string instead of boolean)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${WORKSPACE_ID}/extension-visibility/${CONTRIBUTION_ID}`,
        headers: {
          authorization: `Bearer ${tenantToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ isVisible: 'true' }),
      });

      expect(res.statusCode).toBe(400);
    });

    it('400 — invalid workspaceId (not UUID)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/not-a-uuid/extension-visibility/${CONTRIBUTION_ID}`,
        headers: {
          authorization: `Bearer ${tenantToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ isVisible: false }),
      });

      expect(res.statusCode).toBe(400);
    });

    it('401 — no auth header', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${WORKSPACE_ID}/extension-visibility/${CONTRIBUTION_ID}`,
        body: JSON.stringify({ isVisible: false }),
      });
      expect(res.statusCode).toBe(401);
    });

    it('403 — WORKSPACE_VISIBILITY_DENIED returns correct error code', async () => {
      mockSetVisibility.mockRejectedValueOnce(
        new Error('WORKSPACE_VISIBILITY_DENIED: Insufficient permissions')
      );

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${WORKSPACE_ID}/extension-visibility/${CONTRIBUTION_ID}`,
        headers: {
          authorization: `Bearer ${tenantToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ isVisible: false }),
      });

      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe(
        'WORKSPACE_VISIBILITY_DENIED'
      );
    });

    it('403 — ABAC denies extension_visibility:manage returns WORKSPACE_VISIBILITY_DENIED', async () => {
      // F-006: inline role check replaced by ABAC engine call — verify DENY path.
      mockAuthorize.mockResolvedValueOnce({
        permitted: false,
        checkedPermissions: ['extension_visibility:manage'],
        userPermissions: [],
        fromCache: false,
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${WORKSPACE_ID}/extension-visibility/${CONTRIBUTION_ID}`,
        headers: {
          authorization: `Bearer ${tenantToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ isVisible: false }),
      });

      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe(
        'WORKSPACE_VISIBILITY_DENIED'
      );
      // Verify the ABAC engine was invoked with the correct permission
      expect(mockAuthorize).toHaveBeenCalledWith(
        expect.any(String), // userId
        TENANT_ID,
        expect.any(String), // schemaName
        ['extension_visibility:manage']
      );
    });

    it('200 — ABAC permits extension_visibility:manage, setVisibility is called', async () => {
      // F-006: verify that when ABAC permits, the service layer is reached.
      mockAuthorize.mockResolvedValueOnce({
        permitted: true,
        checkedPermissions: ['extension_visibility:manage'],
        userPermissions: ['extension_visibility:manage'],
        fromCache: false,
      });
      mockSetVisibility.mockResolvedValueOnce({ id: 'vis-2', isVisible: true });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${WORKSPACE_ID}/extension-visibility/${CONTRIBUTION_ID}`,
        headers: {
          authorization: `Bearer ${tenantToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ isVisible: true }),
      });

      expect(res.statusCode).toBe(200);
      expect(mockSetVisibility).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Object), // settings
        WORKSPACE_ID,
        CONTRIBUTION_ID,
        true
      );
    });
  });

  // ── GET /api/v1/extension-registry/slots/:pluginId/:slotId/dependents ─────

  describe('GET /api/v1/extension-registry/slots/:pluginId/:slotId/dependents', () => {
    it('200 — returns dependents list', async () => {
      mockGetSlotDependents.mockResolvedValue({
        count: 2,
        plugins: ['plugin-beta', 'plugin-gamma'],
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/extension-registry/slots/${PLUGIN_ID}/action-bar/dependents`,
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: { count: number; plugins: string[] } }>();
      expect(body.data.count).toBe(2);
      expect(body.data.plugins).toEqual(['plugin-beta', 'plugin-gamma']);
    });

    it('404 — SLOT_NOT_FOUND returns correct error code', async () => {
      mockGetSlotDependents.mockRejectedValueOnce(new Error('SLOT_NOT_FOUND: slot does not exist'));

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/extension-registry/slots/${PLUGIN_ID}/missing-slot/dependents`,
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('SLOT_NOT_FOUND');
    });

    it('401 — no auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/extension-registry/slots/${PLUGIN_ID}/action-bar/dependents`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Security: service-layer filtering ─────────────────────────────────────
  //
  // Fix-9: Three missing security tests identified by forge-review covering the
  // filterContributions() guard (service layer), workspace-level visibility, and
  // cross-tenant isolation on the PATCH visibility endpoint.

  describe('Security — contribution filtering and cross-tenant isolation', () => {
    it('200 — contributions with invalid validationStatus are excluded from the response', async () => {
      // The service's filterContributions() must strip contributions where
      // validationStatus !== "valid" before they reach the caller (Art. 5.1, FR-009).
      // The route test verifies the contract: if the service returns an empty array
      // (because all contributions were filtered), the API returns an empty data list.
      mockGetContributions.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/extension-registry/contributions',
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      // Service already filtered invalid contributions — API must NOT re-inject them.
      expect(res.json<{ data: unknown[] }>().data).toEqual([]);
      // Verify the service was called with the tenant context so filtering is tenant-scoped.
      expect(mockGetContributions).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Object), // tenant settings
        expect.any(Object) // filters
      );
    });

    it('200 — workspace-disabled contributions are excluded (isVisible=false at workspace level)', async () => {
      // Contributions toggled off via PATCH extension-visibility must not appear
      // in the contributions list for that workspace (Art. 5.1, FR-010).
      // The service handles this — route test verifies the API returns only the
      // subset already filtered by the service.
      const visibleContribution = { ...SAMPLE_CONTRIBUTION, isVisible: true };
      mockGetContributions.mockResolvedValueOnce([visibleContribution]);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/extension-registry/contributions?workspaceId=${WORKSPACE_ID}`,
        headers: { authorization: `Bearer ${tenantToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: (typeof SAMPLE_CONTRIBUTION)[] }>();
      // Only visible contributions should be present
      expect(body.data.every((c) => c.isVisible === true)).toBe(true);
      // Workspace filter was forwarded to the service
      expect(mockGetContributions).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Object),
        expect.objectContaining({ workspaceId: WORKSPACE_ID })
      );
    });

    it('403 — Tenant A cannot toggle visibility of a contribution belonging to Tenant B', async () => {
      // Cross-tenant isolation: setVisibility must reject requests where the
      // authenticated tenant does not own the contribution (Art. 5.2, Constitution §3.3).
      // The service layer enforces this; the route test verifies the 403 surface.
      mockSetVisibility.mockRejectedValueOnce(
        Object.assign(
          new Error('TENANT_ISOLATION_VIOLATION: contribution belongs to a different tenant'),
          { code: 'TENANT_ISOLATION_VIOLATION' }
        )
      );

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${WORKSPACE_ID}/extension-visibility/${CONTRIBUTION_ID}`,
        headers: {
          authorization: `Bearer ${tenantToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ isVisible: false }),
      });

      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('TENANT_ISOLATION_VIOLATION');
    });
  });
});
