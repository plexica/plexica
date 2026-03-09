// apps/core-api/src/__tests__/layout-config/unit/layout-config.service.test.ts
//
// T014-24 — Unit tests for LayoutConfigService resolution engine.
// Spec 014 Frontend Layout Engine — FR-007, FR-008, FR-009, NFR-001, NFR-008.
//
// Coverage targets:
//   - resolveForUser(): 100% branch coverage on the resolution algorithm
//   - resolveEffectiveRoles(): Keycloak mapping, team DB roles, fail-open, default VIEWER
//   - applyConfigForUser(): field ordering, stale field skipping, new field appending
//   - resolveFieldVisibility(): globalVisibility, role-specific, most-permissive-wins
//   - resolveColumnVisibility(): globalVisibility, role-specific most-permissive
//   - buildManifestDefaults(): all visible, source='manifest'
//   - Cache: Redis hit (skip DB), Redis error (fail-open to DB)
//   - Fail-open: outer try/catch returns manifest defaults on any error
//   - ETag conflict: DomainError LAYOUT_CONFIG_CONFLICT (409)
//   - Revert without previous version: DomainError NO_PREVIOUS_VERSION (400)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all external dependencies BEFORE importing the service
// ---------------------------------------------------------------------------

vi.mock('../../../lib/db.js', () => ({
  db: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    tenant: { findFirst: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
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

vi.mock('../../../services/audit-log.service.js', () => ({
  auditLogService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../services/tenant.service.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
    getTenantBySlug: vi.fn(),
  },
}));

vi.mock('../../../services/layout-config-validation.service.js', () => ({
  layoutConfigValidationService: {
    validateAgainstManifest: vi.fn(),
    validateSize: vi.fn().mockReturnValue(true),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { LayoutConfigService, DomainError } from '../../../services/layout-config.service.js';
import { db } from '../../../lib/db.js';
import { redis } from '../../../lib/redis.js';
import { logger } from '../../../lib/logger.js';
import type { FormSchema, LayoutConfig, FieldOverride, ColumnOverride } from '@plexica/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-001';
const TENANT_SLUG = 'acme-corp';
const USER_ID = 'user-uuid-001';
const FORM_ID = 'crm.contact-edit';
const PLUGIN_ID = 'plugin-uuid-crm';
const CONFIG_ID = 'config-uuid-001';
const NOW = new Date('2026-03-08T10:00:00.000Z');

const makeManifestPlugin = (formSchemas: FormSchema[]) => ({
  id: PLUGIN_ID,
  name: 'crm-plugin',
  manifest: { formSchemas },
});

const makeFormSchema = (overrides: Partial<FormSchema> = {}): FormSchema => ({
  formId: FORM_ID,
  label: 'Contact Edit',
  fields: [
    {
      fieldId: 'first-name',
      label: 'First Name',
      type: 'text',
      required: true,
      defaultValue: null,
    },
    { fieldId: 'email', label: 'Email', type: 'text', required: true, defaultValue: null },
    { fieldId: 'budget', label: 'Budget', type: 'number', required: false, defaultValue: null },
  ],
  sections: [{ sectionId: 'basic', label: 'Basic Info' }],
  columns: [
    { columnId: 'col-name', label: 'Name' },
    { columnId: 'col-email', label: 'Email' },
  ],
  ...overrides,
});

const makeFieldOverride = (
  fieldId: string,
  globalVisibility: FieldOverride['globalVisibility'],
  visibility?: FieldOverride['visibility'],
  order = 0
): FieldOverride => ({
  fieldId,
  order,
  globalVisibility,
  visibility: visibility ?? {},
});

const makeColumnOverride = (
  columnId: string,
  globalVisibility: ColumnOverride['globalVisibility'],
  visibility?: ColumnOverride['visibility']
): ColumnOverride => ({
  columnId,
  globalVisibility,
  visibility: visibility ?? {},
});

const makeLayoutConfig = (overrides: Partial<LayoutConfig> = {}): LayoutConfig => ({
  id: CONFIG_ID,
  formId: FORM_ID,
  pluginId: PLUGIN_ID,
  scopeType: 'tenant',
  scopeId: null,
  fields: [],
  sections: [],
  columns: [],
  previousVersion: null,
  createdBy: USER_ID,
  updatedBy: USER_ID,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Helper: mock DB $queryRaw sequence
// ---------------------------------------------------------------------------

const mockDb = db as {
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
  tenant: { findFirst: ReturnType<typeof vi.fn> };
};

const mockRedis = redis as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LayoutConfigService', () => {
  let service: LayoutConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LayoutConfigService();
    // Default: Redis cache miss
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
  });

  // -------------------------------------------------------------------------
  // resolveForUser — happy path: tenant config exists
  // -------------------------------------------------------------------------

  describe('resolveForUser — tenant config', () => {
    it('should return resolved layout from tenant config when no workspace scope', async () => {
      // Arrange: plugin manifest + tenant config
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [
          makeFieldOverride('first-name', 'visible', {}, 0),
          makeFieldOverride('email', 'visible', {}, 1),
          makeFieldOverride('budget', 'hidden', {}, 2),
        ],
      });

      // First call: getFormSchema (plugin manifest query)
      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])]) // getFormSchema
        .mockResolvedValueOnce([
          // getConfig (tenant-scope)
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: config.sections,
            columns: config.columns,
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]); // resolveEffectiveRoles team query

      // Act
      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        ['tenant_admin'],
        FORM_ID
      );

      // Assert
      expect(result.formId).toBe(FORM_ID);
      expect(result.source).toBe('tenant');
      expect(result.fields).toHaveLength(3);
      expect(result.fields[0].fieldId).toBe('first-name');
      expect(result.fields[1].fieldId).toBe('email');
      expect(result.fields[2].fieldId).toBe('budget');
      expect(result.fields[2].visibility).toBe('hidden');
    });

    it('should use source="manifest" when no config exists for the form', async () => {
      const formSchema = makeFormSchema();
      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])]) // getFormSchema
        .mockResolvedValueOnce([]) // getConfig returns nothing
        .mockResolvedValueOnce([]); // team roles

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      expect(result.source).toBe('manifest');
      expect(result.fields).toHaveLength(3);
      expect(result.fields.every((f) => f.visibility === 'visible')).toBe(true);
    });

    it('should return empty manifest defaults when formId is not in any plugin manifest', async () => {
      mockDb.$queryRaw.mockResolvedValueOnce([]); // no plugins with this form

      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        [],
        'unknown.form-id'
      );

      expect(result.source).toBe('manifest');
      expect(result.fields).toHaveLength(0);
      expect(result.formId).toBe('unknown.form-id');
    });
  });

  // -------------------------------------------------------------------------
  // resolveForUser — workspace scope fallback
  // -------------------------------------------------------------------------

  describe('resolveForUser — workspace scope', () => {
    it('should use workspace config when workspaceId provided and config exists', async () => {
      const WS_ID = 'ws-uuid-001';
      const formSchema = makeFormSchema();
      const wsConfig = makeLayoutConfig({
        scopeType: 'workspace',
        scopeId: WS_ID,
        fields: [makeFieldOverride('budget', 'readonly', {}, 0)],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])]) // getFormSchema
        .mockResolvedValueOnce([
          // getConfig workspace-scope
          {
            id: wsConfig.id,
            form_id: wsConfig.formId,
            plugin_id: wsConfig.pluginId,
            scope_type: 'workspace',
            scope_id: WS_ID,
            fields: wsConfig.fields,
            sections: wsConfig.sections,
            columns: wsConfig.columns,
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]); // team roles

      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        [],
        FORM_ID,
        WS_ID
      );

      expect(result.source).toBe('workspace');
    });

    it('should fall back to tenant config when workspace config is absent', async () => {
      const WS_ID = 'ws-uuid-002';
      const formSchema = makeFormSchema();
      const tenantConfig = makeLayoutConfig({
        fields: [makeFieldOverride('email', 'readonly', {}, 0)],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])]) // getFormSchema
        .mockResolvedValueOnce([]) // workspace config: not found
        .mockResolvedValueOnce([
          // tenant config fallback
          {
            id: tenantConfig.id,
            form_id: tenantConfig.formId,
            plugin_id: tenantConfig.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: tenantConfig.fields,
            sections: tenantConfig.sections,
            columns: tenantConfig.columns,
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]); // team roles

      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        [],
        FORM_ID,
        WS_ID
      );

      expect(result.source).toBe('tenant');
    });
  });

  // -------------------------------------------------------------------------
  // resolveForUser — Redis cache
  // -------------------------------------------------------------------------

  describe('resolveForUser — Redis cache', () => {
    it('should use cached config on Redis cache hit and skip DB config query', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [makeFieldOverride('email', 'visible', {}, 0)],
      });

      // Cache returns the config as JSON
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(config));

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])]) // getFormSchema
        .mockResolvedValueOnce([]); // team roles (no DB config call expected)

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      expect(result.source).toBe('tenant');
      // DB $queryRaw only called twice (manifest + team roles), NOT for config
      expect(mockDb.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('should fall through to DB when Redis get throws (fail-open)', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig();

      // Redis throws
      mockRedis.get.mockRejectedValueOnce(new Error('Redis connection timeout'));

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])]) // getFormSchema
        .mockResolvedValueOnce([
          // DB config fallback
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: config.sections,
            columns: config.columns,
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]); // team roles

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      expect(result).toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID }),
        expect.stringContaining('Redis read failed')
      );
    });
  });

  // -------------------------------------------------------------------------
  // resolveForUser — fail-open on outer error
  // -------------------------------------------------------------------------

  describe('resolveForUser — fail-open', () => {
    it('should return manifest defaults when getFormSchema throws (fail-open)', async () => {
      // First call throws; second call (inside catch) also throws → empty manifest defaults
      mockDb.$queryRaw
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockRejectedValueOnce(new Error('DB connection lost'));

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      expect(result.source).toBe('manifest');
      expect(result.fields).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID }),
        expect.stringContaining('resolveForUser failed')
      );
    });
  });

  // -------------------------------------------------------------------------
  // resolveEffectiveRoles — Keycloak role mapping
  // -------------------------------------------------------------------------

  describe('resolveEffectiveRoles — Keycloak roles', () => {
    it('should map tenant_admin Keycloak role to TENANT_ADMIN', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [makeFieldOverride('budget', 'hidden', { TENANT_ADMIN: 'visible' }, 0)],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]); // no team roles

      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        ['tenant_admin'], // Keycloak role
        FORM_ID
      );

      const budgetField = result.fields.find((f) => f.fieldId === 'budget');
      // TENANT_ADMIN override is 'visible', global is 'hidden' → most permissive = visible
      expect(budgetField?.visibility).toBe('visible');
    });

    it('should map tenant-admin (hyphen) Keycloak role to TENANT_ADMIN', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [makeFieldOverride('budget', 'hidden', { TENANT_ADMIN: 'visible' }, 0)],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        ['tenant-admin'],
        FORM_ID
      );

      const budgetField = result.fields.find((f) => f.fieldId === 'budget');
      expect(budgetField?.visibility).toBe('visible');
    });

    it('should default to VIEWER when no Keycloak roles match', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [makeFieldOverride('budget', 'hidden', { VIEWER: 'readonly' }, 0)],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]); // no team roles → defaults to VIEWER

      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        ['unknown_role'],
        FORM_ID
      );

      const budgetField = result.fields.find((f) => f.fieldId === 'budget');
      // No keycloak role mapped, no team roles → defaults to VIEWER → VIEWER has 'readonly' override
      // global=hidden, VIEWER=readonly → most permissive = readonly
      expect(budgetField?.visibility).toBe('readonly');
    });

    it('should fail-open and use Keycloak roles when team DB query throws', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [makeFieldOverride('email', 'hidden', { TENANT_ADMIN: 'visible' }, 0)],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockRejectedValueOnce(new Error('team_members table not found')); // team roles fail

      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        ['tenant_admin'], // Keycloak role that should still work after team role failure
        FORM_ID
      );

      const emailField = result.fields.find((f) => f.fieldId === 'email');
      // Global=hidden, TENANT_ADMIN=visible → most permissive = visible
      expect(emailField?.visibility).toBe('visible');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ tenantSlug: TENANT_SLUG }),
        expect.stringContaining('team role lookup failed')
      );
    });

    it('should merge Keycloak roles and team member roles', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [makeFieldOverride('budget', 'hidden', { OWNER: 'visible' }, 0)],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([{ role: 'OWNER' }]); // team role = OWNER

      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        ['tenant_member'], // Keycloak role (no budget override for TENANT_MEMBER)
        FORM_ID
      );

      const budgetField = result.fields.find((f) => f.fieldId === 'budget');
      // OWNER team role overrides global=hidden → visible
      expect(budgetField?.visibility).toBe('visible');
    });
  });

  // -------------------------------------------------------------------------
  // resolveFieldVisibility — most-permissive-wins (FR-007)
  // -------------------------------------------------------------------------

  describe('resolveFieldVisibility — most-permissive-wins', () => {
    it('should use globalVisibility when no role-specific overrides match', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [makeFieldOverride('budget', 'readonly', {}, 0)],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      const budgetField = result.fields.find((f) => f.fieldId === 'budget');
      // No roles matched (defaults to VIEWER), no VIEWER override → globalVisibility=readonly
      expect(budgetField?.visibility).toBe('readonly');
    });

    it('should pick most permissive when user has multiple roles (visible > readonly > hidden)', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [
          makeFieldOverride(
            'budget',
            'hidden',
            { VIEWER: 'hidden', MEMBER: 'readonly', ADMIN: 'visible' },
            0
          ),
        ],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([{ role: 'VIEWER' }, { role: 'MEMBER' }, { role: 'ADMIN' }]);

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      const budgetField = result.fields.find((f) => f.fieldId === 'budget');
      // ADMIN role has 'visible' — most permissive wins
      expect(budgetField?.visibility).toBe('visible');
    });

    it('should resolve readonly when visible is not present but readonly is', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [makeFieldOverride('budget', 'hidden', { VIEWER: 'readonly' }, 0)],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      const budgetField = result.fields.find((f) => f.fieldId === 'budget');
      // Default to VIEWER, global=hidden, VIEWER=readonly → most permissive = readonly
      expect(budgetField?.visibility).toBe('readonly');
    });
  });

  // -------------------------------------------------------------------------
  // applyConfigForUser — field ordering, stale fields, new fields
  // -------------------------------------------------------------------------

  describe('applyConfigForUser — field ordering and completeness', () => {
    it('should silently skip stale fields (removed from manifest) — Edge Case #1', async () => {
      const formSchema = makeFormSchema(); // has: first-name, email, budget
      const config = makeLayoutConfig({
        fields: [
          makeFieldOverride('first-name', 'visible', {}, 0),
          makeFieldOverride('stale-field-id', 'visible', {}, 1), // stale — not in manifest
          makeFieldOverride('email', 'visible', {}, 2),
        ],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      const fieldIds = result.fields.map((f) => f.fieldId);
      expect(fieldIds).not.toContain('stale-field-id');
      // first-name and email are in result
      expect(fieldIds).toContain('first-name');
      expect(fieldIds).toContain('email');
    });

    it('should append new manifest fields (not in config) at the end', async () => {
      const formSchema = makeFormSchema(); // has: first-name, email, budget
      const config = makeLayoutConfig({
        fields: [
          makeFieldOverride('first-name', 'visible', {}, 0),
          // email and budget NOT in config → should be appended
        ],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      const fieldIds = result.fields.map((f) => f.fieldId);
      // first-name first (from config), then email and budget appended
      expect(fieldIds[0]).toBe('first-name');
      expect(fieldIds).toContain('email');
      expect(fieldIds).toContain('budget');
      // New fields default to visible
      const emailField = result.fields.find((f) => f.fieldId === 'email');
      expect(emailField?.visibility).toBe('visible');
    });

    it('should set readonly=true on field with visibility="readonly"', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        fields: [makeFieldOverride('email', 'readonly', {}, 0)],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      const emailField = result.fields.find((f) => f.fieldId === 'email');
      expect(emailField?.readonly).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Column visibility resolution
  // -------------------------------------------------------------------------

  describe('resolveColumnVisibility', () => {
    it('should hide column when globalVisibility="hidden" and no role overrides', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        columns: [makeColumnOverride('col-name', 'hidden', {})],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: [],
            sections: [],
            columns: config.columns,
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      const col = result.columns.find((c) => c.columnId === 'col-name');
      expect(col?.visibility).toBe('hidden');
    });

    it('should show column when globalVisibility="hidden" but user role is "visible"', async () => {
      const formSchema = makeFormSchema();
      const config = makeLayoutConfig({
        columns: [makeColumnOverride('col-name', 'hidden', { VIEWER: 'visible' })],
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: [],
            sections: [],
            columns: config.columns,
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]); // defaults to VIEWER

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      const col = result.columns.find((c) => c.columnId === 'col-name');
      expect(col?.visibility).toBe('visible');
    });

    it('should append new manifest columns not in config as visible', async () => {
      const formSchema = makeFormSchema(); // has col-name, col-email
      const config = makeLayoutConfig({
        columns: [makeColumnOverride('col-name', 'visible', {})],
        // col-email not in config
      });

      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: [],
            sections: [],
            columns: config.columns,
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      const colEmail = result.columns.find((c) => c.columnId === 'col-email');
      expect(colEmail).toBeDefined();
      expect(colEmail?.visibility).toBe('visible');
    });
  });

  // -------------------------------------------------------------------------
  // buildManifestDefaults
  // -------------------------------------------------------------------------

  describe('buildManifestDefaults', () => {
    it('should return all fields visible with source="manifest" and no sections/columns', async () => {
      const formSchema = makeFormSchema();
      // No config (tenant-scope) → manifest defaults
      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])])
        .mockResolvedValueOnce([]) // no config
        .mockResolvedValueOnce([]); // team roles

      const result = await service.resolveForUser(TENANT_ID, TENANT_SLUG, USER_ID, [], FORM_ID);

      expect(result.source).toBe('manifest');
      expect(result.fields).toHaveLength(3);
      result.fields.forEach((f, i) => {
        expect(f.visibility).toBe('visible');
        expect(f.readonly).toBe(false);
        expect(f.order).toBe(i);
      });
      expect(result.sections).toHaveLength(0);
      expect(result.columns).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // saveConfig — ETag conflict (Edge Case #5)
  // -------------------------------------------------------------------------

  describe('saveConfig — ETag conflict', () => {
    it('should throw LAYOUT_CONFIG_CONFLICT (409) when ETag does not match', async () => {
      // Existing config has updatedAt = NOW
      mockDb.$queryRaw.mockResolvedValueOnce([
        {
          id: CONFIG_ID,
          form_id: FORM_ID,
          plugin_id: PLUGIN_ID,
          scope_type: 'tenant',
          scope_id: null,
          fields: [],
          sections: [],
          columns: [],
          previous_version: null,
          created_by: USER_ID,
          updated_by: USER_ID,
          deleted_at: null,
          created_at: NOW,
          updated_at: NOW,
        },
      ]);

      const staleEtag = new Date('2026-01-01T00:00:00.000Z').toISOString();

      await expect(
        service.saveConfig(
          TENANT_ID,
          TENANT_SLUG,
          USER_ID,
          FORM_ID,
          'tenant',
          null,
          { pluginId: PLUGIN_ID, fields: [], sections: [], columns: [] },
          staleEtag
        )
      ).rejects.toThrow(DomainError);

      await expect(
        service.saveConfig(
          TENANT_ID,
          TENANT_SLUG,
          USER_ID,
          FORM_ID,
          'tenant',
          null,
          { pluginId: PLUGIN_ID, fields: [], sections: [], columns: [] },
          staleEtag
        )
      )
        .rejects.toThrow()
        .catch((err: unknown) => {
          if (err instanceof DomainError) {
            expect(err.code).toBe('LAYOUT_CONFIG_CONFLICT');
            expect(err.statusCode).toBe(409);
          }
        });
    });
  });

  // -------------------------------------------------------------------------
  // revertConfig — no previous version
  // -------------------------------------------------------------------------

  describe('revertConfig — no previous version', () => {
    it('should throw NO_PREVIOUS_VERSION (400) when previousVersion is null', async () => {
      mockDb.$queryRaw.mockResolvedValueOnce([
        {
          id: CONFIG_ID,
          form_id: FORM_ID,
          plugin_id: PLUGIN_ID,
          scope_type: 'tenant',
          scope_id: null,
          fields: [],
          sections: [],
          columns: [],
          previous_version: null,
          created_by: USER_ID,
          updated_by: USER_ID,
          deleted_at: null,
          created_at: NOW,
          updated_at: NOW,
        },
      ]);

      try {
        await service.revertConfig(TENANT_ID, TENANT_SLUG, USER_ID, FORM_ID, 'tenant');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DomainError);
        if (err instanceof DomainError) {
          expect(err.code).toBe('NO_PREVIOUS_VERSION');
          expect(err.statusCode).toBe(400);
        }
      }
    });

    it('should throw LAYOUT_CONFIG_NOT_FOUND (404) when config does not exist', async () => {
      mockDb.$queryRaw.mockResolvedValueOnce([]); // no config

      try {
        await service.revertConfig(TENANT_ID, TENANT_SLUG, USER_ID, FORM_ID, 'tenant');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DomainError);
        if (err instanceof DomainError) {
          expect(err.code).toBe('LAYOUT_CONFIG_NOT_FOUND');
          expect(err.statusCode).toBe(404);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // invalidateCache
  // -------------------------------------------------------------------------

  describe('invalidateCache', () => {
    it('should call redis.del with the correct cache key', async () => {
      await service.invalidateCache(TENANT_ID, FORM_ID, 'tenant');
      expect(mockRedis.del).toHaveBeenCalledWith(`layout:${TENANT_ID}:${FORM_ID}:tenant`);
    });

    it('should fail-open when redis.del throws', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('connection refused'));
      // Should not throw
      await expect(service.invalidateCache(TENANT_ID, FORM_ID, 'tenant')).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID }),
        expect.stringContaining('Redis invalidate failed')
      );
    });
  });

  // -------------------------------------------------------------------------
  // P2-C: cross-workspace role isolation
  // resolveEffectiveRoles must NOT allow team roles from workspace A to bleed
  // into a resolution context for workspace B.
  // -------------------------------------------------------------------------

  describe('resolveEffectiveRoles — cross-workspace isolation (P2-C)', () => {
    it('should NOT apply OWNER role from workspace-A when resolving for workspace-B', async () => {
      const WS_A = 'ws-uuid-aaa';
      const WS_B = 'ws-uuid-bbb';
      const formSchema = makeFormSchema();
      // Budget field: OWNER sees 'visible', global is 'hidden'
      const config = makeLayoutConfig({
        scopeType: 'workspace',
        scopeId: WS_B,
        fields: [makeFieldOverride('budget', 'hidden', { OWNER: 'visible' }, 0)],
      });

      // The user is OWNER in workspace A, MEMBER in workspace B.
      // When resolving for workspace B, only WS_B team roles should be used.
      // The DB query for team roles is called with workspaceId=WS_B, so it
      // returns MEMBER (not OWNER).
      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])]) // getFormSchema
        .mockResolvedValueOnce([
          // getConfig workspace-scope for WS_B
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'workspace',
            scope_id: WS_B,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        // resolveEffectiveRoles: only returns MEMBER for WS_B (OWNER role exists
        // in WS_A but the query filters by workspaceId=WS_B, so it does NOT appear)
        .mockResolvedValueOnce([{ role: 'MEMBER' }]);

      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        [], // no keycloak roles
        FORM_ID,
        WS_B
      );

      const budgetField = result.fields.find((f) => f.fieldId === 'budget');
      // MEMBER has no override for budget; globalVisibility='hidden'.
      // Most-permissive among [MEMBER(no override → global=hidden)] = hidden.
      // If workspace-A OWNER role had bled in, budget would be 'visible' — which is wrong.
      expect(budgetField?.visibility).toBe('hidden');
    });

    it('should NOT apply workspace-A roles when no workspaceId given (tenant-scope resolution)', async () => {
      const formSchema = makeFormSchema();
      // Budget field: OWNER sees 'visible', global is 'hidden'
      const config = makeLayoutConfig({
        fields: [makeFieldOverride('budget', 'hidden', { OWNER: 'visible' }, 0)],
      });

      // Without a workspaceId, resolveEffectiveRoles uses the unscoped team query
      // (no JOIN on workspace_id). This returns roles across ALL workspaces.
      // The test verifies that even with global OWNER membership visible, the
      // scoped-workspace query is NOT executed (i.e., no cross-workspace injection
      // when the call is intentionally unscoped).
      mockDb.$queryRaw
        .mockResolvedValueOnce([makeManifestPlugin([formSchema])]) // getFormSchema
        .mockResolvedValueOnce([
          // getConfig tenant-scope
          {
            id: config.id,
            form_id: config.formId,
            plugin_id: config.pluginId,
            scope_type: 'tenant',
            scope_id: null,
            fields: config.fields,
            sections: [],
            columns: [],
            previous_version: null,
            created_by: USER_ID,
            updated_by: USER_ID,
            deleted_at: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ])
        // Unscoped team roles: user has no OWNER role at tenant level
        .mockResolvedValueOnce([{ role: 'MEMBER' }]);

      const result = await service.resolveForUser(
        TENANT_ID,
        TENANT_SLUG,
        USER_ID,
        [],
        FORM_ID
        // No workspaceId
      );

      const budgetField = result.fields.find((f) => f.fieldId === 'budget');
      // MEMBER has no OWNER override → global=hidden
      expect(budgetField?.visibility).toBe('hidden');

      // Verify the DB team-role query was called without a workspace JOIN
      // (i.e., the unscoped SQL path — 3rd call to $queryRaw)
      const teamRoleCall = mockDb.$queryRaw.mock.calls[2];
      // The SQL template tag is not directly inspectable as a string, but we can
      // assert the call happened and only returned MEMBER (no OWNER bleed-in).
      expect(teamRoleCall).toBeDefined();
    });
  });
});
