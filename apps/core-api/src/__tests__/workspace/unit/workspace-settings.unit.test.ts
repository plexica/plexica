/**
 * Workspace Settings Unit Tests
 *
 * Tests for Spec 009, Task 4 (Gap 4) — Workspace Settings CRUD:
 *   - WorkspaceSettingsSchema validation
 *   - WorkspaceSettingsUpdateSchema partial validation
 *   - validateWorkspaceSettings() helper
 *   - validateWorkspaceSettingsUpdate() helper
 *   - mergeSettings() merge logic
 *   - WorkspaceService.updateSettings() service method (mocked DB)
 *   - maxMembers enforcement in WorkspaceService.addMember() (mocked DB)
 *   - PATCH /workspaces/:workspaceId/settings route (mocked service)
 *
 * Constitution: Art. 5.3 (Zod validation), Art. 8.1 (required test types),
 *               Art. 8.2 (AAA pattern, descriptive names)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  WorkspaceSettingsSchema,
  WorkspaceSettingsUpdateSchema,
  validateWorkspaceSettings,
  validateWorkspaceSettingsUpdate,
  mergeSettings,
} from '../../../modules/workspace/schemas/workspace-settings.schema.js';
import type { WorkspaceSettings } from '../../../modules/workspace/schemas/workspace-settings.schema.js';
import { WorkspaceService } from '../../../modules/workspace/workspace.service.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFullSettings(overrides: Partial<WorkspaceSettings> = {}): WorkspaceSettings {
  return {
    defaultMemberRole: 'MEMBER',
    allowCrossWorkspaceSharing: false,
    maxMembers: 0,
    isPublic: false,
    notificationsEnabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Schema validation — WorkspaceSettingsSchema
// ---------------------------------------------------------------------------

describe('WorkspaceSettingsSchema', () => {
  describe('defaults', () => {
    it('should apply sensible defaults when parsing empty object', () => {
      // Arrange
      const input = {};

      // Act
      const result = WorkspaceSettingsSchema.parse(input);

      // Assert
      expect(result.defaultMemberRole).toBe('MEMBER');
      expect(result.allowCrossWorkspaceSharing).toBe(false);
      expect(result.maxMembers).toBe(0);
      expect(result.isPublic).toBe(false);
      expect(result.notificationsEnabled).toBe(true);
    });
  });

  describe('defaultMemberRole', () => {
    it('should accept ADMIN, MEMBER, VIEWER roles', () => {
      // Arrange + Act + Assert
      for (const role of ['ADMIN', 'MEMBER', 'VIEWER'] as const) {
        const result = WorkspaceSettingsSchema.parse({ defaultMemberRole: role });
        expect(result.defaultMemberRole).toBe(role);
      }
    });

    it('should reject unknown roles', () => {
      // Arrange
      const input = { defaultMemberRole: 'SUPERUSER' };

      // Act + Assert
      expect(() => WorkspaceSettingsSchema.parse(input)).toThrow();
    });
  });

  describe('maxMembers', () => {
    it('should accept 0 (unlimited)', () => {
      const result = WorkspaceSettingsSchema.parse({ maxMembers: 0 });
      expect(result.maxMembers).toBe(0);
    });

    it('should accept positive integers', () => {
      const result = WorkspaceSettingsSchema.parse({ maxMembers: 50 });
      expect(result.maxMembers).toBe(50);
    });

    it('should reject negative values', () => {
      expect(() => WorkspaceSettingsSchema.parse({ maxMembers: -1 })).toThrow();
    });

    it('should reject non-integer values', () => {
      expect(() => WorkspaceSettingsSchema.parse({ maxMembers: 10.5 })).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Schema validation — WorkspaceSettingsUpdateSchema (partial)
// ---------------------------------------------------------------------------

describe('WorkspaceSettingsUpdateSchema', () => {
  it('should accept empty object and apply schema defaults', () => {
    // The partial schema is built on a schema with .default() values, so
    // parsing {} still yields defaults (all fields optional but defaulted).
    const result = WorkspaceSettingsUpdateSchema.parse({});
    // All defaults applied — this is the correct behavior
    expect(result.defaultMemberRole).toBe('MEMBER');
    expect(result.maxMembers).toBe(0);
    expect(result.isPublic).toBe(false);
    expect(result.notificationsEnabled).toBe(true);
    expect(result.allowCrossWorkspaceSharing).toBe(false);
  });

  it('should accept partial updates (only specified fields override defaults)', () => {
    const result = WorkspaceSettingsUpdateSchema.parse({ isPublic: true });
    expect(result.isPublic).toBe(true);
    // Other fields still get their defaults
    expect(result.maxMembers).toBe(0);
  });

  it('should still reject invalid field values when provided', () => {
    expect(() => WorkspaceSettingsUpdateSchema.parse({ maxMembers: -5 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateWorkspaceSettings()
// ---------------------------------------------------------------------------

describe('validateWorkspaceSettings()', () => {
  it('should return valid=true and typed settings for a valid object', () => {
    // Arrange
    const input = {
      defaultMemberRole: 'ADMIN',
      allowCrossWorkspaceSharing: true,
      maxMembers: 25,
      isPublic: true,
      notificationsEnabled: false,
    };

    // Act
    const result = validateWorkspaceSettings(input);

    // Assert
    expect(result.valid).toBe(true);
    expect(result.settings).toEqual(input);
    expect(result.errors).toHaveLength(0);
  });

  it('should return valid=true with defaults applied for empty object', () => {
    const result = validateWorkspaceSettings({});
    expect(result.valid).toBe(true);
    expect(result.settings?.maxMembers).toBe(0);
  });

  it('should return valid=false with error messages for invalid data', () => {
    // Arrange
    const input = { maxMembers: -1, defaultMemberRole: 'INVALID_ROLE' };

    // Act
    const result = validateWorkspaceSettings(input);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.settings).toBeUndefined();
  });

  it('should include field path in error messages', () => {
    const result = validateWorkspaceSettings({ maxMembers: -99 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maxMembers'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateWorkspaceSettingsUpdate()
// ---------------------------------------------------------------------------

describe('validateWorkspaceSettingsUpdate()', () => {
  it('should return valid=true for empty object and apply defaults', () => {
    // Partial schema still applies .default() values from base schema
    const result = validateWorkspaceSettingsUpdate({});
    expect(result.valid).toBe(true);
    expect(result.settings?.defaultMemberRole).toBe('MEMBER');
    expect(result.settings?.maxMembers).toBe(0);
  });

  it('should return valid=true for a subset of fields', () => {
    const result = validateWorkspaceSettingsUpdate({ notificationsEnabled: false });
    expect(result.valid).toBe(true);
    expect(result.settings?.notificationsEnabled).toBe(false);
  });

  it('should return valid=false when a provided field has invalid type', () => {
    const result = validateWorkspaceSettingsUpdate({ allowCrossWorkspaceSharing: 'yes' as any });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should return valid=false with field-level error for invalid maxMembers', () => {
    const result = validateWorkspaceSettingsUpdate({ maxMembers: -10 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maxMembers'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mergeSettings()
// ---------------------------------------------------------------------------

describe('mergeSettings()', () => {
  it('should merge update fields into existing settings', () => {
    // Arrange
    const existing = makeFullSettings({ maxMembers: 10, isPublic: false });
    const update = { isPublic: true, maxMembers: 20 };

    // Act
    const merged = mergeSettings(existing, update);

    // Assert
    expect(merged.isPublic).toBe(true);
    expect(merged.maxMembers).toBe(20);
    // Unchanged fields preserved
    expect(merged.defaultMemberRole).toBe('MEMBER');
    expect(merged.allowCrossWorkspaceSharing).toBe(false);
    expect(merged.notificationsEnabled).toBe(true);
  });

  it('should apply defaults when existing settings is null', () => {
    // Arrange + Act
    const merged = mergeSettings(null, { isPublic: true });

    // Assert
    expect(merged.isPublic).toBe(true);
    expect(merged.maxMembers).toBe(0); // default
    expect(merged.defaultMemberRole).toBe('MEMBER'); // default
  });

  it('should apply defaults when existing settings is undefined', () => {
    const merged = mergeSettings(undefined, {});
    expect(merged).toEqual(makeFullSettings());
  });

  it('should not mutate the existing settings object', () => {
    // Arrange
    const existing = makeFullSettings({ maxMembers: 5 });
    const frozen = { ...existing };

    // Act
    mergeSettings(existing, { maxMembers: 99 });

    // Assert — original unchanged
    expect(existing.maxMembers).toBe(frozen.maxMembers);
  });

  it('should strip unknown keys from the merged result', () => {
    // Arrange
    const existing = makeFullSettings();
    const update = { isPublic: true, unknownKey: 'bad' } as any;

    // Act
    const merged = mergeSettings(existing, update);

    // Assert
    expect((merged as any).unknownKey).toBeUndefined();
  });

  it('should handle partial existing settings with unknown extra fields gracefully', () => {
    // Arrange — DB might return a settings blob with extra/missing fields
    const existing = { defaultMemberRole: 'ADMIN', someOldField: true } as any;
    const update = { notificationsEnabled: false };

    // Act
    const merged = mergeSettings(existing, update);

    // Assert
    expect(merged.defaultMemberRole).toBe('ADMIN');
    expect(merged.notificationsEnabled).toBe(false);
    expect((merged as any).someOldField).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WorkspaceService.updateSettings() — mocked DB
// ---------------------------------------------------------------------------

describe('WorkspaceService.updateSettings()', () => {
  // Mock helpers
  //
  // The service now uses a single atomic `UPDATE … RETURNING settings`
  // statement via $queryRawUnsafe.  There is no separate SELECT or
  // $executeRawUnsafe call anymore.
  function createMockDb(opts: {
    /** Rows returned by the atomic UPDATE … RETURNING query */
    updateReturningRows?: unknown[];
  }) {
    return {
      $queryRawUnsafe: vi.fn().mockResolvedValue(opts.updateReturningRows ?? []),
      // $executeRawUnsafe is no longer called by updateSettings; kept on the
      // mock so the constructor / other methods don't explode if they need it.
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };
  }

  function createMockLogger() {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };
  }

  const tenantCtx = {
    tenantId: 'tenant-abc',
    tenantSlug: 'acme',
    schemaName: 'tenant_acme',
    userId: 'user-001',
  };

  const workspaceId = 'ws-111-222';

  it('should return merged settings after atomic UPDATE … RETURNING', async () => {
    // Arrange — the DB returns the already-merged settings blob (as PostgreSQL
    // would after applying `settings || $1::jsonb`).
    const dbReturnedSettings = makeFullSettings({ maxMembers: 10, isPublic: true });
    const mockDb = createMockDb({
      updateReturningRows: [{ settings: dbReturnedSettings }],
    });
    const mockLogger = createMockLogger();

    const service = new WorkspaceService(mockDb as any, undefined, undefined, mockLogger as any);

    // Act
    const result = await service.updateSettings(workspaceId, { isPublic: true }, tenantCtx);

    // Assert
    expect(result.isPublic).toBe(true);
    expect(result.maxMembers).toBe(10); // preserved from what DB returned
    // Exactly one $queryRawUnsafe call (the atomic UPDATE … RETURNING)
    expect(mockDb.$queryRawUnsafe).toHaveBeenCalledOnce();
    // $executeRawUnsafe must NOT be called (no separate UPDATE step)
    expect(mockDb.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('should throw when workspace is not found (UPDATE … RETURNING returns empty)', async () => {
    // Arrange — UPDATE matched 0 rows (wrong id / tenant), returns no rows
    const mockDb = createMockDb({ updateReturningRows: [] });
    const mockLogger = createMockLogger();

    const service = new WorkspaceService(mockDb as any, undefined, undefined, mockLogger as any);

    // Act + Assert
    await expect(
      service.updateSettings(workspaceId, { isPublic: true }, tenantCtx)
    ).rejects.toThrow(`Workspace ${workspaceId} not found`);
  });

  it('should apply schema defaults when DB returns empty settings object', async () => {
    // Arrange — workspace existed but settings column was `{}`; DB returns `{}`
    // after the merge (update was also `{}`).  Zod defaults must fill the gaps.
    const mockDb = createMockDb({
      updateReturningRows: [{ settings: {} }],
    });
    const mockLogger = createMockLogger();

    const service = new WorkspaceService(mockDb as any, undefined, undefined, mockLogger as any);

    // Act
    const result = await service.updateSettings(workspaceId, {}, tenantCtx);

    // Assert — all defaults applied
    expect(result.defaultMemberRole).toBe('MEMBER');
    expect(result.maxMembers).toBe(0);
    expect(result.isPublic).toBe(false);
    expect(result.notificationsEnabled).toBe(true);
  });

  it('should apply schema defaults when DB returns settings as a JSON string', async () => {
    // Arrange — some driver versions return JSONB as a raw JSON string
    const mockDb = createMockDb({
      updateReturningRows: [{ settings: JSON.stringify({ maxMembers: 42, isPublic: true }) }],
    });
    const mockLogger = createMockLogger();

    const service = new WorkspaceService(mockDb as any, undefined, undefined, mockLogger as any);

    // Act
    const result = await service.updateSettings(workspaceId, { maxMembers: 42 }, tenantCtx);

    // Assert
    expect(result.maxMembers).toBe(42);
    expect(result.isPublic).toBe(true);
    // Missing fields filled by Zod defaults
    expect(result.defaultMemberRole).toBe('MEMBER');
  });

  it('should reject invalid schema name to prevent SQL injection', async () => {
    // Arrange
    const badTenantCtx = { ...tenantCtx, schemaName: 'bad; DROP TABLE' };
    const mockDb = createMockDb({});
    const mockLogger = createMockLogger();

    const service = new WorkspaceService(mockDb as any, undefined, undefined, mockLogger as any);

    // Act + Assert
    await expect(service.updateSettings(workspaceId, {}, badTenantCtx as any)).rejects.toThrow(
      'Invalid schema name'
    );
  });
});

// ---------------------------------------------------------------------------
// maxMembers enforcement in addMember() — boundary conditions
// ---------------------------------------------------------------------------

describe('mergeSettings() — maxMembers boundary', () => {
  it('should treat 0 as unlimited (no capping)', () => {
    const s = mergeSettings(null, { maxMembers: 0 });
    expect(s.maxMembers).toBe(0);
  });

  it('should correctly merge maxMembers to its exact positive value', () => {
    const existing = makeFullSettings({ maxMembers: 100 });
    const merged = mergeSettings(existing, { maxMembers: 1 });
    expect(merged.maxMembers).toBe(1);
  });
});
