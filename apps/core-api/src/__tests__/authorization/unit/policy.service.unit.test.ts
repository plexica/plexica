// apps/core-api/src/__tests__/authorization/unit/policy.service.unit.test.ts
//
// Unit tests for PolicyService and ConditionValidatorService.
// Spec 003 Task 5.8 — FR-007–FR-009, FR-014–FR-015, Edge Cases #3 and #12

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables are initialized before vi.mock() hoisting
// ---------------------------------------------------------------------------

const mockDb = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
}));

vi.mock('../../../lib/db.js', () => ({ db: mockDb }));
vi.mock('../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import after mocks
import { PolicyService } from '../../../modules/authorization/policy.service.js';
import {
  PolicyNotFoundError,
  PolicyNameConflictError,
  PolicySourceImmutableError,
  FeatureNotAvailableError,
  ConditionTreeInvalidError,
} from '../../../modules/authorization/policy.service.js';
import { ConditionValidatorService } from '../../../modules/authorization/condition-validator.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-1';
const SCHEMA_NAME = 'tenant_acme';
const POLICY_ID = 'policy-uuid-1';

function makePolicy(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: POLICY_ID,
    tenant_id: TENANT_ID,
    name: 'Test Policy',
    resource: 'posts',
    effect: 'DENY',
    conditions: { attribute: 'user.role', operator: 'equals', value: 'banned' },
    priority: 0,
    source: 'tenant_admin',
    plugin_id: null,
    is_active: true,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

const VALID_LEAF = {
  attribute: 'user.role',
  operator: 'equals' as const,
  value: 'banned',
};

// ---------------------------------------------------------------------------
// ConditionValidatorService
// ---------------------------------------------------------------------------

describe('ConditionValidatorService', () => {
  let validator: ConditionValidatorService;

  beforeEach(() => {
    validator = new ConditionValidatorService();
  });

  it('should return valid=true for a simple leaf condition', () => {
    const result = validator.validate(VALID_LEAF);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return valid=true for nested "all"/"any" combinators within depth limit', () => {
    const tree = { all: [{ any: [VALID_LEAF] }] };
    expect(validator.validate(tree).valid).toBe(true);
  });

  it('should return valid=false when tree exceeds MAX_DEPTH of 5', () => {
    // Build a depth-6 tree: not → not → not → not → not → leaf
    let node: unknown = VALID_LEAF;
    for (let i = 0; i < 6; i++) node = { not: node };
    const result = validator.validate(node);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nesting depth'))).toBe(true);
  });

  it('should return valid=false when leaf count exceeds 20', () => {
    const leaves = Array(21).fill(VALID_LEAF);
    const result = validator.validate({ all: leaves });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('leaf conditions'))).toBe(true);
  });

  it('should return valid=false when payload exceeds 64 KB', () => {
    // Craft a leaf whose value is a very long string to exceed 65536 bytes
    const hugeValue = 'x'.repeat(70_000);
    const result = validator.validate({ attribute: 'a', operator: 'equals', value: hugeValue });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('payload exceeds'))).toBe(true);
  });

  it('should accumulate multiple errors', () => {
    // Exceed both depth and count simultaneously
    let node: unknown = { all: Array(21).fill(VALID_LEAF) };
    for (let i = 0; i < 6; i++) node = { not: node };
    const result = validator.validate(node);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  // measureDepth edge cases
  it('measureDepth should return 0 for null input', () => {
    expect(validator.measureDepth(null)).toBe(0);
  });

  it('measureDepth should return 1 for a leaf node', () => {
    expect(validator.measureDepth(VALID_LEAF)).toBe(1);
  });

  it('measureDepth should measure "all" combinator depth correctly', () => {
    const tree = { all: [VALID_LEAF, { not: VALID_LEAF }] };
    expect(validator.measureDepth(tree)).toBe(3);
  });

  // countConditions edge cases
  it('countConditions should return 0 for null input', () => {
    expect(validator.countConditions(null)).toBe(0);
  });

  it('countConditions should return 1 for a leaf', () => {
    expect(validator.countConditions(VALID_LEAF)).toBe(1);
  });

  it('countConditions should sum nested leaves', () => {
    const tree = { all: [VALID_LEAF, { any: [VALID_LEAF, VALID_LEAF] }] };
    expect(validator.countConditions(tree)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// PolicyService — isAbacEnabled (via listPolicies)
// ---------------------------------------------------------------------------

describe('PolicyService', () => {
  let service: PolicyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PolicyService();
  });

  // -------------------------------------------------------------------------
  // listPolicies
  // -------------------------------------------------------------------------

  describe('listPolicies', () => {
    it('should return empty page with featureEnabled=false when ABAC is disabled', async () => {
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ abac_enabled: null }]);

      const result = await service.listPolicies(TENANT_ID, SCHEMA_NAME);

      expect(result.data).toHaveLength(0);
      expect(result.meta.featureEnabled).toBe(false);
      expect(result.meta.total).toBe(0);
    });

    it('should return policies when ABAC is enabled', async () => {
      const row = makePolicy();
      // First call: abac feature flag check
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ abac_enabled: 'true' }])
        // COUNT query
        .mockResolvedValueOnce([{ total: '1' }])
        // SELECT query
        .mockResolvedValueOnce([row]);

      const result = await service.listPolicies(TENANT_ID, SCHEMA_NAME);

      expect(result.meta.featureEnabled).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(POLICY_ID);
    });

    it('should throw on invalid schema name', async () => {
      await expect(service.listPolicies(TENANT_ID, 'invalid-schema')).rejects.toThrow(
        'Invalid schema name'
      );
    });

    it('should return featureEnabled=false when isAbacEnabled throws', async () => {
      mockDb.$queryRawUnsafe.mockRejectedValueOnce(new Error('DB down'));

      const result = await service.listPolicies(TENANT_ID, SCHEMA_NAME);
      expect(result.meta.featureEnabled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getPolicy
  // -------------------------------------------------------------------------

  describe('getPolicy', () => {
    it('should return the policy when found', async () => {
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([makePolicy()]);

      const result = await service.getPolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID);

      expect(result.id).toBe(POLICY_ID);
      expect(result.name).toBe('Test Policy');
    });

    it('should throw PolicyNotFoundError when row is empty', async () => {
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([]);

      await expect(service.getPolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID)).rejects.toThrow(
        PolicyNotFoundError
      );
    });

    it('should throw on invalid schema name', async () => {
      await expect(service.getPolicy(TENANT_ID, 'bad!schema', POLICY_ID)).rejects.toThrow(
        'Invalid schema name'
      );
    });
  });

  // -------------------------------------------------------------------------
  // createPolicy
  // -------------------------------------------------------------------------

  describe('createPolicy', () => {
    const dto = {
      name: 'Block banned',
      resource: 'posts',
      effect: 'DENY' as const,
      priority: 5,
      conditions: VALID_LEAF,
    };

    it('should throw FeatureNotAvailableError when ABAC is disabled', async () => {
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ abac_enabled: null }]);

      await expect(service.createPolicy(TENANT_ID, SCHEMA_NAME, dto)).rejects.toThrow(
        FeatureNotAvailableError
      );
    });

    it('should throw ConditionTreeInvalidError for an oversized condition tree', async () => {
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ abac_enabled: 'true' }]);
      const hugeDto = {
        ...dto,
        conditions: { attribute: 'a', operator: 'equals' as const, value: 'x'.repeat(70_000) },
      };

      await expect(service.createPolicy(TENANT_ID, SCHEMA_NAME, hugeDto)).rejects.toThrow(
        ConditionTreeInvalidError
      );
    });

    it('should throw PolicyNameConflictError when name already exists', async () => {
      // abac enabled
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ abac_enabled: 'true' }]);
      // name check: conflict found
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'existing-id' }]);

      await expect(service.createPolicy(TENANT_ID, SCHEMA_NAME, dto)).rejects.toThrow(
        PolicyNameConflictError
      );
    });

    it('should create and return the policy on success', async () => {
      const row = makePolicy();
      // abac enabled
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ abac_enabled: 'true' }]);
      // name check: no conflict
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([]);
      // insert returning
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([row]);

      const result = await service.createPolicy(TENANT_ID, SCHEMA_NAME, dto);

      expect(result.id).toBe(POLICY_ID);
      expect(result.source).toBe('tenant_admin');
    });

    it('should throw on invalid schema name', async () => {
      await expect(service.createPolicy(TENANT_ID, 'bad', dto)).rejects.toThrow('Invalid schema');
    });
  });

  // -------------------------------------------------------------------------
  // updatePolicy
  // -------------------------------------------------------------------------

  describe('updatePolicy', () => {
    it('should throw FeatureNotAvailableError when ABAC is disabled', async () => {
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ abac_enabled: null }]);

      await expect(
        service.updatePolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID, { name: 'x' })
      ).rejects.toThrow(FeatureNotAvailableError);
    });

    it('should throw PolicySourceImmutableError for core-source policy', async () => {
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ abac_enabled: 'true' }])
        .mockResolvedValueOnce([makePolicy({ source: 'core' })]);

      await expect(
        service.updatePolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID, { name: 'x' })
      ).rejects.toThrow(PolicySourceImmutableError);
    });

    it('should throw PolicySourceImmutableError for plugin-source policy', async () => {
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ abac_enabled: 'true' }])
        .mockResolvedValueOnce([makePolicy({ source: 'plugin' })]);

      await expect(
        service.updatePolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID, { name: 'new' })
      ).rejects.toThrow(PolicySourceImmutableError);
    });

    it('should throw PolicyNameConflictError when new name conflicts', async () => {
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ abac_enabled: 'true' }])
        // getPolicy (existing)
        .mockResolvedValueOnce([makePolicy({ name: 'old-name' })])
        // name conflict check
        .mockResolvedValueOnce([{ id: 'other-policy' }]);

      await expect(
        service.updatePolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID, { name: 'conflict' })
      ).rejects.toThrow(PolicyNameConflictError);
    });

    it('should throw ConditionTreeInvalidError when new conditions are invalid', async () => {
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ abac_enabled: 'true' }])
        .mockResolvedValueOnce([makePolicy()]);

      const badConditions = {
        attribute: 'a',
        operator: 'equals' as const,
        value: 'x'.repeat(70_000),
      };
      await expect(
        service.updatePolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID, { conditions: badConditions })
      ).rejects.toThrow(ConditionTreeInvalidError);
    });

    it('should update and return the policy on success', async () => {
      const updated = makePolicy({ name: 'Updated' });
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ abac_enabled: 'true' }])
        // getPolicy (existing)
        .mockResolvedValueOnce([makePolicy()])
        // no name check (name unchanged)
        // executeRaw (UPDATE)
        // getPolicy (refetch)
        .mockResolvedValueOnce([updated]);
      mockDb.$executeRawUnsafe.mockResolvedValueOnce(1);

      const result = await service.updatePolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID, {
        priority: 10,
      });

      expect(result.id).toBe(POLICY_ID);
      expect(mockDb.$executeRawUnsafe).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // deletePolicy
  // -------------------------------------------------------------------------

  describe('deletePolicy', () => {
    it('should throw FeatureNotAvailableError when ABAC is disabled', async () => {
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ abac_enabled: null }]);

      await expect(service.deletePolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID)).rejects.toThrow(
        FeatureNotAvailableError
      );
    });

    it('should throw PolicySourceImmutableError for core-source policy', async () => {
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ abac_enabled: 'true' }])
        .mockResolvedValueOnce([makePolicy({ source: 'core' })]);

      await expect(service.deletePolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID)).rejects.toThrow(
        PolicySourceImmutableError
      );
    });

    it('should delete the policy on success', async () => {
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ abac_enabled: 'true' }])
        .mockResolvedValueOnce([makePolicy()]);
      mockDb.$executeRawUnsafe.mockResolvedValueOnce(1);

      await expect(
        service.deletePolicy(TENANT_ID, SCHEMA_NAME, POLICY_ID)
      ).resolves.toBeUndefined();
      expect(mockDb.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        POLICY_ID,
        TENANT_ID
      );
    });
  });

  // -------------------------------------------------------------------------
  // registerPluginPolicies
  // -------------------------------------------------------------------------

  describe('registerPluginPolicies', () => {
    it('should no-op when policies array is empty', async () => {
      await service.registerPluginPolicies(TENANT_ID, SCHEMA_NAME, 'plugin-1', []);
      expect(mockDb.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('should throw ConditionTreeInvalidError for invalid plugin policy conditions', async () => {
      const badPolicy = {
        name: 'bad',
        resource: 'posts',
        effect: 'DENY' as const,
        conditions: { attribute: 'a', operator: 'equals' as const, value: 'x'.repeat(70_000) },
      };

      await expect(
        service.registerPluginPolicies(TENANT_ID, SCHEMA_NAME, 'plugin-1', [badPolicy])
      ).rejects.toThrow(ConditionTreeInvalidError);
    });

    it('should insert plugin policies with ON CONFLICT DO NOTHING', async () => {
      mockDb.$executeRawUnsafe.mockResolvedValueOnce(1);

      const policy = {
        name: 'restrict-read',
        resource: 'posts',
        effect: 'DENY' as const,
        conditions: VALID_LEAF,
        priority: 5,
      };

      await service.registerPluginPolicies(TENANT_ID, SCHEMA_NAME, 'plugin-1', [policy]);

      expect(mockDb.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        TENANT_ID,
        policy.name,
        policy.resource,
        policy.effect,
        JSON.stringify(policy.conditions),
        policy.priority,
        'plugin-1'
      );
    });

    it('should throw on invalid schema name', async () => {
      await expect(
        service.registerPluginPolicies(TENANT_ID, 'bad!', 'plugin-1', [])
      ).rejects.toThrow('Invalid schema');
    });
  });

  // -------------------------------------------------------------------------
  // removePluginPolicies
  // -------------------------------------------------------------------------

  describe('removePluginPolicies', () => {
    it('should execute DELETE for plugin policies', async () => {
      mockDb.$executeRawUnsafe.mockResolvedValueOnce(3);

      await service.removePluginPolicies(TENANT_ID, SCHEMA_NAME, 'plugin-1');

      expect(mockDb.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("source = 'plugin'"),
        TENANT_ID,
        'plugin-1'
      );
    });

    it('should throw on invalid schema name', async () => {
      await expect(service.removePluginPolicies(TENANT_ID, 'bad!', 'plugin-1')).rejects.toThrow(
        'Invalid schema'
      );
    });
  });
});
