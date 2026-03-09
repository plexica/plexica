/**
 * Unit Tests: Extension Registry Zod Validation Schemas
 *
 * Spec 013 — Extension Points, T013-21 (Plan §4.4, Art. 5.3, Art. 8.1).
 *
 * Covers all schemas in extension-registry.schema.ts and the
 * isExtensionPointsEnabled feature-flag helper.
 * No external dependencies required — pure unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  GetSlotsQuerySchema,
  GetSlotsByPluginParamsSchema,
  GetContributionsQuerySchema,
  EntityExtensionParamsSchema,
  VisibilityPatchParamsSchema,
  VisibilityPatchSchema,
  SlotDependentsParamsSchema,
  isExtensionPointsEnabled,
} from '../../../modules/extension-registry/extension-registry.schema.js';

// ---------------------------------------------------------------------------
// isExtensionPointsEnabled
// ---------------------------------------------------------------------------

describe('isExtensionPointsEnabled', () => {
  it('should return true when extension_points_enabled is true', () => {
    expect(isExtensionPointsEnabled({ extension_points_enabled: true })).toBe(true);
  });

  it('should return false when flag is false', () => {
    expect(isExtensionPointsEnabled({ extension_points_enabled: false })).toBe(false);
  });

  it('should return false when flag is absent', () => {
    expect(isExtensionPointsEnabled({})).toBe(false);
  });

  it('should return false when flag is a string "true"', () => {
    expect(isExtensionPointsEnabled({ extension_points_enabled: 'true' })).toBe(false);
  });

  it('should return false when flag is a number 1', () => {
    expect(isExtensionPointsEnabled({ extension_points_enabled: 1 })).toBe(false);
  });

  it('should return false when flag is null', () => {
    expect(isExtensionPointsEnabled({ extension_points_enabled: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GetSlotsQuerySchema
// ---------------------------------------------------------------------------

describe('GetSlotsQuerySchema', () => {
  it('should accept an empty object (all fields optional)', () => {
    const result = GetSlotsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid type=action', () => {
    const result = GetSlotsQuerySchema.safeParse({ type: 'action' });
    expect(result.success).toBe(true);
  });

  it('should accept valid type=panel', () => {
    expect(GetSlotsQuerySchema.safeParse({ type: 'panel' }).success).toBe(true);
  });

  it('should accept valid type=form', () => {
    expect(GetSlotsQuerySchema.safeParse({ type: 'form' }).success).toBe(true);
  });

  it('should accept valid type=toolbar', () => {
    expect(GetSlotsQuerySchema.safeParse({ type: 'toolbar' }).success).toBe(true);
  });

  it('should reject invalid type=menu', () => {
    const result = GetSlotsQuerySchema.safeParse({ type: 'menu' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid type=widget', () => {
    expect(GetSlotsQuerySchema.safeParse({ type: 'widget' }).success).toBe(false);
  });

  it('should accept valid pluginId', () => {
    expect(GetSlotsQuerySchema.safeParse({ pluginId: 'my-plugin' }).success).toBe(true);
  });

  it('should reject empty pluginId (min 1)', () => {
    expect(GetSlotsQuerySchema.safeParse({ pluginId: '' }).success).toBe(false);
  });

  it('should reject pluginId exceeding 255 chars', () => {
    const long = 'a'.repeat(256);
    expect(GetSlotsQuerySchema.safeParse({ pluginId: long }).success).toBe(false);
  });

  it('should accept pluginId exactly 255 chars', () => {
    const maxLen = 'a'.repeat(255);
    expect(GetSlotsQuerySchema.safeParse({ pluginId: maxLen }).success).toBe(true);
  });

  it('should reject pluginId with null byte', () => {
    expect(GetSlotsQuerySchema.safeParse({ pluginId: 'plug\u0000in' }).success).toBe(false);
  });

  it('should reject extra unknown fields (strict mode)', () => {
    expect(GetSlotsQuerySchema.safeParse({ type: 'action', extra: true }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GetSlotsByPluginParamsSchema
// ---------------------------------------------------------------------------

describe('GetSlotsByPluginParamsSchema', () => {
  it('should accept valid pluginId', () => {
    expect(GetSlotsByPluginParamsSchema.safeParse({ pluginId: 'plugin-abc' }).success).toBe(true);
  });

  it('should reject empty pluginId', () => {
    expect(GetSlotsByPluginParamsSchema.safeParse({ pluginId: '' }).success).toBe(false);
  });

  it('should reject missing pluginId', () => {
    expect(GetSlotsByPluginParamsSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GetContributionsQuerySchema
// ---------------------------------------------------------------------------

describe('GetContributionsQuerySchema', () => {
  it('should accept empty object', () => {
    expect(GetContributionsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('should accept valid UUID workspaceId', () => {
    const result = GetContributionsQuerySchema.safeParse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID workspaceId', () => {
    expect(GetContributionsQuerySchema.safeParse({ workspaceId: 'not-a-uuid' }).success).toBe(
      false
    );
  });

  it('should reject workspaceId with wrong format (plain string)', () => {
    expect(GetContributionsQuerySchema.safeParse({ workspaceId: 'workspace-abc' }).success).toBe(
      false
    );
  });

  it('should accept valid type filter', () => {
    expect(GetContributionsQuerySchema.safeParse({ type: 'panel' }).success).toBe(true);
  });

  it('should reject invalid type filter', () => {
    expect(GetContributionsQuerySchema.safeParse({ type: 'sidebar' }).success).toBe(false);
  });

  it('should reject null byte in slotId', () => {
    expect(GetContributionsQuerySchema.safeParse({ slotId: 'slot\u0000' }).success).toBe(false);
  });

  it('should reject extra unknown fields', () => {
    expect(GetContributionsQuerySchema.safeParse({ unknown: true }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EntityExtensionParamsSchema
// ---------------------------------------------------------------------------

describe('EntityExtensionParamsSchema', () => {
  const valid = { pluginId: 'plugin-crm', entityType: 'contact', entityId: 'entity-123' };

  it('should accept valid params', () => {
    expect(EntityExtensionParamsSchema.safeParse(valid).success).toBe(true);
  });

  it('should reject empty pluginId', () => {
    expect(EntityExtensionParamsSchema.safeParse({ ...valid, pluginId: '' }).success).toBe(false);
  });

  it('should reject empty entityType', () => {
    expect(EntityExtensionParamsSchema.safeParse({ ...valid, entityType: '' }).success).toBe(false);
  });

  it('should reject empty entityId', () => {
    expect(EntityExtensionParamsSchema.safeParse({ ...valid, entityId: '' }).success).toBe(false);
  });

  it('should reject null byte in entityId', () => {
    expect(
      EntityExtensionParamsSchema.safeParse({ ...valid, entityId: 'e\u0000123' }).success
    ).toBe(false);
  });

  it('should reject extra fields', () => {
    expect(EntityExtensionParamsSchema.safeParse({ ...valid, extra: 'x' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VisibilityPatchParamsSchema
// ---------------------------------------------------------------------------

describe('VisibilityPatchParamsSchema', () => {
  const valid = {
    workspaceId: '550e8400-e29b-41d4-a716-446655440000',
    contributionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  };

  it('should accept valid UUIDs', () => {
    expect(VisibilityPatchParamsSchema.safeParse(valid).success).toBe(true);
  });

  it('should reject non-UUID workspaceId', () => {
    expect(VisibilityPatchParamsSchema.safeParse({ ...valid, workspaceId: 'ws-abc' }).success).toBe(
      false
    );
  });

  it('should reject non-UUID contributionId', () => {
    expect(
      VisibilityPatchParamsSchema.safeParse({ ...valid, contributionId: 'contrib-abc' }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VisibilityPatchSchema (request body)
// ---------------------------------------------------------------------------

describe('VisibilityPatchSchema', () => {
  it('should accept isVisible: true', () => {
    expect(VisibilityPatchSchema.safeParse({ isVisible: true }).success).toBe(true);
  });

  it('should accept isVisible: false', () => {
    expect(VisibilityPatchSchema.safeParse({ isVisible: false }).success).toBe(true);
  });

  it('should reject isVisible as string "true"', () => {
    expect(VisibilityPatchSchema.safeParse({ isVisible: 'true' }).success).toBe(false);
  });

  it('should reject isVisible as number 1', () => {
    expect(VisibilityPatchSchema.safeParse({ isVisible: 1 }).success).toBe(false);
  });

  it('should reject missing isVisible', () => {
    expect(VisibilityPatchSchema.safeParse({}).success).toBe(false);
  });

  it('should reject extra unknown fields (strict mode)', () => {
    expect(VisibilityPatchSchema.safeParse({ isVisible: true, extra: 'x' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SlotDependentsParamsSchema
// ---------------------------------------------------------------------------

describe('SlotDependentsParamsSchema', () => {
  const valid = { pluginId: 'plugin-abc', slotId: 'slot-1' };

  it('should accept valid params', () => {
    expect(SlotDependentsParamsSchema.safeParse(valid).success).toBe(true);
  });

  it('should reject empty pluginId', () => {
    expect(SlotDependentsParamsSchema.safeParse({ ...valid, pluginId: '' }).success).toBe(false);
  });

  it('should reject empty slotId', () => {
    expect(SlotDependentsParamsSchema.safeParse({ ...valid, slotId: '' }).success).toBe(false);
  });

  it('should reject null byte in slotId', () => {
    expect(SlotDependentsParamsSchema.safeParse({ ...valid, slotId: 'slot\u0000' }).success).toBe(
      false
    );
  });

  it('should reject extra fields', () => {
    expect(SlotDependentsParamsSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });
});
