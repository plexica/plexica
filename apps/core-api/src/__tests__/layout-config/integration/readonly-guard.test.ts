// apps/core-api/src/__tests__/layout-config/integration/readonly-guard.test.ts
//
// T014-27 — Integration tests for layoutReadonlyGuard middleware.
// Spec 014 Frontend Layout Engine — FR-021, NFR-006, NFR-008.
//
// Strategy: register a lightweight Fastify test app with a mock PUT route
// protected by layoutReadonlyGuard. Inject requests and assert whether
// readonly field values are stripped from the body before handler runs.
//
// The guard itself uses layoutConfigService.resolveForUser and tenantService
// internally — both mocked via vi.mock to avoid real DB/Redis.
//
// Fail-closed (default) scenarios:
//   - No user on request → 401 UNAUTHORIZED
//   - Tenant not found → 503 LAYOUT_RESOLUTION_UNAVAILABLE
//   - resolveForUser throws → 503 LAYOUT_RESOLUTION_UNAVAILABLE
//
// Fail-open (opt-in via { failOpen: true }) scenarios:
//   - resolveForUser throws with failOpen:true → body not modified, request proceeds

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the guard
// ---------------------------------------------------------------------------

vi.mock('../../../services/layout-config.service.js', () => ({
  layoutConfigService: {
    resolveForUser: vi.fn(),
    getFormSchema: vi.fn(),
  },
  DomainError: class DomainError extends Error {
    constructor(
      public code: string,
      message: string,
      public statusCode: number
    ) {
      super(message);
    }
  },
}));

vi.mock('../../../services/tenant.service.js', () => ({
  tenantService: {
    getTenantBySlug: vi.fn(),
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { layoutReadonlyGuard } from '../../../middleware/layout-readonly-guard.js';
import { layoutConfigService } from '../../../services/layout-config.service.js';
import { tenantService } from '../../../services/tenant.service.js';
import { logger } from '../../../lib/logger.js';

// ---------------------------------------------------------------------------
// Typed mocks
// ---------------------------------------------------------------------------

const mockResolveForUser = layoutConfigService.resolveForUser as ReturnType<typeof vi.fn>;
const mockGetFormSchema = layoutConfigService.getFormSchema as ReturnType<typeof vi.fn>;
const mockGetTenantBySlug = tenantService.getTenantBySlug as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FORM_ID = 'crm.contact-edit';
const TENANT_ID = 'tenant-uuid-001';
const TENANT_SLUG = 'acme-corp';
const USER_ID = 'user-uuid-001';

const mockTenant = { id: TENANT_ID, slug: TENANT_SLUG };

interface CapturedBody {
  body: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Build a minimal Fastify app with the guard on a PUT route
// ---------------------------------------------------------------------------

async function buildGuardTestApp(captured: CapturedBody): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Simulate auth middleware: inject user onto request
  app.addHook('preHandler', async (request) => {
    // @ts-expect-error: test-only injection
    request.user = {
      id: USER_ID,
      tenantSlug: TENANT_SLUG,
      roles: ['tenant_admin'],
    };
  });

  // Default (fail-closed) guard
  app.put('/test-form', { preHandler: [layoutReadonlyGuard(FORM_ID)] }, async (request, reply) => {
    captured.body = { ...(request.body as Record<string, unknown>) };
    return reply.code(200).send({ ok: true });
  });

  // Fail-open opt-in guard (for advisory fields)
  app.put(
    '/test-form-fail-open',
    { preHandler: [layoutReadonlyGuard(FORM_ID, { failOpen: true })] },
    async (request, reply) => {
      captured.body = { ...(request.body as Record<string, unknown>) };
      return reply.code(200).send({ ok: true });
    }
  );

  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('layoutReadonlyGuard', () => {
  let app: FastifyInstance;
  let captured: CapturedBody;

  beforeEach(async () => {
    vi.clearAllMocks();
    captured = { body: {} };
    app = await buildGuardTestApp(captured);

    // Default mocks
    mockGetTenantBySlug.mockResolvedValue(mockTenant);
    mockGetFormSchema.mockResolvedValue(null); // most tests don't need form schema
  });

  afterEach(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Happy path: strip readonly fields
  // -------------------------------------------------------------------------

  describe('happy path — strips readonly fields', () => {
    it('should strip a field that is resolved as readonly', async () => {
      mockResolveForUser.mockResolvedValue({
        formId: FORM_ID,
        source: 'tenant',
        fields: [
          { fieldId: 'email', visibility: 'readonly', readonly: true, order: 0 },
          { fieldId: 'first-name', visibility: 'visible', readonly: false, order: 1 },
        ],
        sections: [],
        columns: [],
      });

      await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'user@example.com', // should be stripped (readonly)
          'first-name': 'Alice', // should pass through (visible)
          budget: 1000, // not in resolved fields — passes through
        },
      });

      expect(captured.body).not.toHaveProperty('email');
      expect(captured.body).toHaveProperty('first-name', 'Alice');
      expect(captured.body).toHaveProperty('budget', 1000);
    });

    it('should strip multiple readonly fields in one request', async () => {
      mockResolveForUser.mockResolvedValue({
        formId: FORM_ID,
        source: 'tenant',
        fields: [
          { fieldId: 'email', visibility: 'readonly', readonly: true, order: 0 },
          { fieldId: 'phone', visibility: 'readonly', readonly: true, order: 1 },
          { fieldId: 'first-name', visibility: 'visible', readonly: false, order: 2 },
        ],
        sections: [],
        columns: [],
      });

      await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'user@example.com',
          phone: '+1234567890',
          'first-name': 'Bob',
        },
      });

      expect(captured.body).not.toHaveProperty('email');
      expect(captured.body).not.toHaveProperty('phone');
      expect(captured.body).toHaveProperty('first-name', 'Bob');
    });

    it('should not strip fields that are visible (not readonly)', async () => {
      mockResolveForUser.mockResolvedValue({
        formId: FORM_ID,
        source: 'manifest',
        fields: [
          { fieldId: 'email', visibility: 'visible', readonly: false, order: 0 },
          { fieldId: 'first-name', visibility: 'visible', readonly: false, order: 1 },
        ],
        sections: [],
        columns: [],
      });

      await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'user@example.com',
          'first-name': 'Carol',
        },
      });

      expect(captured.body).toHaveProperty('email', 'user@example.com');
      expect(captured.body).toHaveProperty('first-name', 'Carol');
    });

    it('should not modify body when resolved fields list is empty (no readonly fields)', async () => {
      mockResolveForUser.mockResolvedValue({
        formId: FORM_ID,
        source: 'manifest',
        fields: [],
        sections: [],
        columns: [],
      });

      await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: { name: 'Dave', age: 30 },
      });

      expect(captured.body).toHaveProperty('name', 'Dave');
      expect(captured.body).toHaveProperty('age', 30);
    });

    it('should not strip a readonly field that is not present in request body', async () => {
      mockResolveForUser.mockResolvedValue({
        formId: FORM_ID,
        source: 'tenant',
        fields: [{ fieldId: 'secret-field', visibility: 'readonly', readonly: true, order: 0 }],
        sections: [],
        columns: [],
      });

      await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: { name: 'Eve' }, // secret-field not present
      });

      // Should not throw; body unchanged
      expect(captured.body).toHaveProperty('name', 'Eve');
    });
  });

  // -------------------------------------------------------------------------
  // Fail-closed (default): no user on request → 401
  // -------------------------------------------------------------------------

  describe('fail-closed — no user on request → 401', () => {
    it('should return 401 UNAUTHORIZED when request has no user', async () => {
      // Build a separate app WITHOUT the user injection hook
      const noUserApp = Fastify({ logger: false });

      noUserApp.put(
        '/test-form',
        { preHandler: [layoutReadonlyGuard(FORM_ID)] },
        async (request, reply) => {
          return reply.code(200).send({ ok: true });
        }
      );

      await noUserApp.ready();

      const resp = await noUserApp.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: { email: 'frank@example.com', secret: 'value' },
      });

      // Guard rejects with 401 — cannot enforce without a user
      expect(resp.statusCode).toBe(401);
      const body = resp.json() as { error: { code: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');

      // resolveForUser should NOT have been called
      expect(mockResolveForUser).not.toHaveBeenCalled();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ formId: FORM_ID }),
        expect.stringContaining('no user on request')
      );

      await noUserApp.close();
    });
  });

  // -------------------------------------------------------------------------
  // Fail-closed (default): tenant not found → 503
  // -------------------------------------------------------------------------

  describe('fail-closed — tenant not found → 503', () => {
    it('should return 503 LAYOUT_RESOLUTION_UNAVAILABLE when tenant lookup throws', async () => {
      mockGetTenantBySlug.mockRejectedValue(new Error('Tenant not found'));

      const resp = await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: { email: 'grace@example.com' },
      });

      expect(resp.statusCode).toBe(503);
      const body = resp.json() as { error: { code: string } };
      expect(body.error.code).toBe('LAYOUT_RESOLUTION_UNAVAILABLE');
      expect(mockResolveForUser).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ formId: FORM_ID }),
        expect.stringContaining('tenant not found')
      );
    });
  });

  // -------------------------------------------------------------------------
  // Fail-closed (default): resolveForUser throws → 503
  // -------------------------------------------------------------------------

  describe('fail-closed — resolveForUser throws → 503', () => {
    it('should return 503 LAYOUT_RESOLUTION_UNAVAILABLE when resolveForUser throws', async () => {
      mockGetTenantBySlug.mockResolvedValue(mockTenant);
      mockResolveForUser.mockRejectedValue(new Error('DB connection lost'));

      const resp = await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: { email: 'henry@example.com', secret: 'do-not-strip' },
      });

      expect(resp.statusCode).toBe(503);
      const body = resp.json() as { error: { code: string } };
      expect(body.error.code).toBe('LAYOUT_RESOLUTION_UNAVAILABLE');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ formId: FORM_ID }),
        expect.stringContaining('resolution error — rejecting request (fail-closed)')
      );
    });
  });

  // -------------------------------------------------------------------------
  // Fail-open (opt-in { failOpen: true }): resolveForUser throws → pass through
  // -------------------------------------------------------------------------

  describe('fail-open (opt-in) — resolveForUser throws with failOpen:true', () => {
    it('should pass body through unchanged when resolveForUser throws and failOpen:true', async () => {
      mockGetTenantBySlug.mockResolvedValue(mockTenant);
      mockResolveForUser.mockRejectedValue(new Error('Redis timeout'));

      const resp = await app.inject({
        method: 'PUT',
        url: '/test-form-fail-open',
        headers: { 'content-type': 'application/json' },
        payload: { email: 'ivan@example.com', advisory: 'keeps-value' },
      });

      // failOpen:true → request proceeds (200), body not modified
      expect(resp.statusCode).toBe(200);
      expect(captured.body).toHaveProperty('email', 'ivan@example.com');
      expect(captured.body).toHaveProperty('advisory', 'keeps-value');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ formId: FORM_ID }),
        expect.stringContaining('resolution error — skipping enforcement (fail-open by option)')
      );
    });
  });

  // -------------------------------------------------------------------------
  // P1-B: Hidden required field default injection (FR-010 server-side)
  // -------------------------------------------------------------------------

  describe('hidden required field default injection (FR-010 / P1-B)', () => {
    it('should inject manifest defaultValue for a hidden required field absent from body', async () => {
      // Layout has 'phone' hidden; manifest says 'phone' is required with defaultValue '+000'
      mockResolveForUser.mockResolvedValue({
        formId: FORM_ID,
        source: 'tenant',
        fields: [
          { fieldId: 'phone', visibility: 'hidden', readonly: false, order: 0 },
          { fieldId: 'first-name', visibility: 'visible', readonly: false, order: 1 },
        ],
        sections: [],
        columns: [],
      });
      mockGetFormSchema.mockResolvedValue({
        formId: FORM_ID,
        label: 'Contact Edit',
        sections: [],
        columns: [],
        fields: [
          {
            fieldId: 'phone',
            label: 'Phone',
            type: 'string',
            required: true,
            defaultValue: '+000',
            sectionId: 'basic',
            order: 0,
          },
          {
            fieldId: 'first-name',
            label: 'First Name',
            type: 'string',
            required: true,
            sectionId: 'basic',
            order: 1,
          },
        ],
      });

      await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: { 'first-name': 'Jane' }, // 'phone' not sent — hidden required field
      });

      // 'phone' injected with manifest default '+000'
      expect(captured.body).toHaveProperty('phone', '+000');
      expect(captured.body).toHaveProperty('first-name', 'Jane');
    });

    it('should NOT override an explicit value for a hidden field when client sent it', async () => {
      // Client explicitly sends 'phone' even though it is hidden — do not overwrite
      mockResolveForUser.mockResolvedValue({
        formId: FORM_ID,
        source: 'tenant',
        fields: [{ fieldId: 'phone', visibility: 'hidden', readonly: false, order: 0 }],
        sections: [],
        columns: [],
      });
      mockGetFormSchema.mockResolvedValue({
        formId: FORM_ID,
        label: 'Contact Edit',
        sections: [],
        columns: [],
        fields: [
          {
            fieldId: 'phone',
            label: 'Phone',
            type: 'string',
            required: true,
            defaultValue: '+000',
            sectionId: 'basic',
            order: 0,
          },
        ],
      });

      await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: { phone: '+12345' }, // client sent a value explicitly
      });

      // Client-supplied value preserved — default NOT injected over it
      expect(captured.body).toHaveProperty('phone', '+12345');
    });

    it('should NOT inject default when manifest field has no defaultValue', async () => {
      mockResolveForUser.mockResolvedValue({
        formId: FORM_ID,
        source: 'tenant',
        fields: [{ fieldId: 'email', visibility: 'hidden', readonly: false, order: 0 }],
        sections: [],
        columns: [],
      });
      mockGetFormSchema.mockResolvedValue({
        formId: FORM_ID,
        label: 'Contact Edit',
        sections: [],
        columns: [],
        fields: [
          // 'email' required but no defaultValue declared in manifest
          {
            fieldId: 'email',
            label: 'Email',
            type: 'string',
            required: true,
            sectionId: 'basic',
            order: 0,
          },
        ],
      });

      await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: { name: 'Karl' },
      });

      // 'email' not injected — no defaultValue in manifest
      expect(captured.body).not.toHaveProperty('email');
      expect(captured.body).toHaveProperty('name', 'Karl');
    });
  });

  describe('body type guard', () => {
    it('should not crash when request body is null', async () => {
      mockResolveForUser.mockResolvedValue({
        formId: FORM_ID,
        source: 'manifest',
        fields: [{ fieldId: 'email', visibility: 'readonly', readonly: true, order: 0 }],
        sections: [],
        columns: [],
      });

      // Null body: send no content-type with empty body
      const resp = await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: null as unknown as string,
      });

      // Should not crash; status 200
      expect([200, 400]).toContain(resp.statusCode);
    });
  });

  // -------------------------------------------------------------------------
  // resolveForUser called with correct args
  // -------------------------------------------------------------------------

  describe('resolveForUser invocation', () => {
    it('should call resolveForUser with tenantId, tenantSlug, userId, roles, formId', async () => {
      mockResolveForUser.mockResolvedValue({
        formId: FORM_ID,
        source: 'manifest',
        fields: [],
        sections: [],
        columns: [],
      });

      await app.inject({
        method: 'PUT',
        url: '/test-form',
        headers: { 'content-type': 'application/json' },
        payload: { name: 'Iris' },
      });

      expect(mockResolveForUser).toHaveBeenCalledWith(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        ['tenant_admin'],
        FORM_ID,
        null // no workspaceId param in test route
      );
    });
  });
});
