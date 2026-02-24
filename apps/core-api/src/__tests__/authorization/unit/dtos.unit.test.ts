// apps/core-api/src/__tests__/authorization/unit/dtos.unit.test.ts
//
// Unit tests for Zod DTO schemas in the authorization module.
// Spec 003 Task 5.7 — FR-001, FR-007, FR-008
//
// Validates: CreateRoleSchema, UpdateRoleSchema, AssignRoleSchema,
//            ConditionTreeSchema (leaf, combinators, recursion),
//            CreatePolicySchema, UpdatePolicySchema

import { describe, it, expect } from 'vitest';
import { CreateRoleSchema } from '../../../modules/authorization/dto/create-role.dto.js';
import { UpdateRoleSchema } from '../../../modules/authorization/dto/update-role.dto.js';
import { AssignRoleSchema } from '../../../modules/authorization/dto/assign-role.dto.js';
import {
  LeafConditionSchema,
  ConditionTreeSchema,
} from '../../../modules/authorization/dto/condition-tree.dto.js';
import { CreatePolicySchema } from '../../../modules/authorization/dto/create-policy.dto.js';
import { UpdatePolicySchema } from '../../../modules/authorization/dto/update-policy.dto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// CreateRoleSchema
// ---------------------------------------------------------------------------

describe('CreateRoleSchema', () => {
  it('should accept a valid role with name and permissionIds', () => {
    const result = CreateRoleSchema.safeParse({
      name: 'editor',
      description: 'Can edit content',
      permissionIds: [VALID_UUID],
    });
    expect(result.success).toBe(true);
  });

  it('should default permissionIds to []', () => {
    const result = CreateRoleSchema.safeParse({ name: 'viewer' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.permissionIds).toEqual([]);
  });

  it('should reject an empty name', () => {
    const result = CreateRoleSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('should reject a name longer than 100 characters', () => {
    const result = CreateRoleSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should reject a name with invalid characters', () => {
    const result = CreateRoleSchema.safeParse({ name: 'role@invalid!' });
    expect(result.success).toBe(false);
  });

  it('should reject a description longer than 500 characters', () => {
    const result = CreateRoleSchema.safeParse({ name: 'role', description: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('should reject non-UUID values in permissionIds', () => {
    const result = CreateRoleSchema.safeParse({ name: 'role', permissionIds: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });

  it('should reject more than 200 permissions', () => {
    const result = CreateRoleSchema.safeParse({
      name: 'role',
      permissionIds: Array(201).fill(VALID_UUID),
    });
    expect(result.success).toBe(false);
  });

  it('should accept name with allowed special characters (underscore, hyphen, space)', () => {
    const result = CreateRoleSchema.safeParse({ name: 'My_Role-Name 2' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UpdateRoleSchema
// ---------------------------------------------------------------------------

describe('UpdateRoleSchema', () => {
  it('should accept an empty object (all fields optional)', () => {
    const result = UpdateRoleSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept a partial update with only name', () => {
    const result = UpdateRoleSchema.safeParse({ name: 'new-name' });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid name even in partial mode', () => {
    const result = UpdateRoleSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AssignRoleSchema
// ---------------------------------------------------------------------------

describe('AssignRoleSchema', () => {
  it('should accept a valid UUID roleId', () => {
    const result = AssignRoleSchema.safeParse({ roleId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('should reject a non-UUID roleId', () => {
    const result = AssignRoleSchema.safeParse({ roleId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject an empty roleId', () => {
    const result = AssignRoleSchema.safeParse({ roleId: '' });
    expect(result.success).toBe(false);
  });

  it('should reject missing roleId', () => {
    const result = AssignRoleSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LeafConditionSchema
// ---------------------------------------------------------------------------

describe('LeafConditionSchema', () => {
  it('should accept a valid leaf condition with string value', () => {
    const result = LeafConditionSchema.safeParse({
      attribute: 'user.role',
      operator: 'equals',
      value: 'admin',
    });
    expect(result.success).toBe(true);
  });

  it('should accept numeric value', () => {
    const result = LeafConditionSchema.safeParse({
      attribute: 'item.price',
      operator: 'greaterThan',
      value: 100,
    });
    expect(result.success).toBe(true);
  });

  it('should accept boolean value', () => {
    const result = LeafConditionSchema.safeParse({
      attribute: 'user.verified',
      operator: 'exists',
      value: true,
    });
    expect(result.success).toBe(true);
  });

  it('should accept array of strings for "in" operator', () => {
    const result = LeafConditionSchema.safeParse({
      attribute: 'user.department',
      operator: 'in',
      value: ['engineering', 'design'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject an unknown operator', () => {
    const result = LeafConditionSchema.safeParse({
      attribute: 'user.role',
      operator: 'startsWith',
      value: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('should reject an empty attribute', () => {
    const result = LeafConditionSchema.safeParse({
      attribute: '',
      operator: 'equals',
      value: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('should reject attribute longer than 256 characters', () => {
    const result = LeafConditionSchema.safeParse({
      attribute: 'a'.repeat(257),
      operator: 'equals',
      value: 'x',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ConditionTreeSchema — combinators and recursion
// ---------------------------------------------------------------------------

describe('ConditionTreeSchema', () => {
  const leaf = { attribute: 'user.role', operator: 'equals', value: 'admin' };

  it('should accept a standalone leaf condition', () => {
    expect(ConditionTreeSchema.safeParse(leaf).success).toBe(true);
  });

  it('should accept an "all" combinator with a leaf', () => {
    const result = ConditionTreeSchema.safeParse({ all: [leaf] });
    expect(result.success).toBe(true);
  });

  it('should accept an "any" combinator with multiple leaves', () => {
    const result = ConditionTreeSchema.safeParse({ any: [leaf, leaf] });
    expect(result.success).toBe(true);
  });

  it('should accept a "not" combinator wrapping a leaf', () => {
    const result = ConditionTreeSchema.safeParse({ not: leaf });
    expect(result.success).toBe(true);
  });

  it('should accept a nested tree (all → any → leaf)', () => {
    const tree = { all: [{ any: [leaf, { not: leaf }] }] };
    expect(ConditionTreeSchema.safeParse(tree).success).toBe(true);
  });

  it('should reject an "all" combinator with an empty array', () => {
    const result = ConditionTreeSchema.safeParse({ all: [] });
    expect(result.success).toBe(false);
  });

  it('should reject an object that is neither a leaf nor a combinator', () => {
    const result = ConditionTreeSchema.safeParse({ unknown: 'field' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreatePolicySchema
// ---------------------------------------------------------------------------

describe('CreatePolicySchema', () => {
  const validLeaf = { attribute: 'user.role', operator: 'equals', value: 'blocked' };

  it('should accept a valid create-policy payload', () => {
    const result = CreatePolicySchema.safeParse({
      name: 'Block read for banned users',
      resource: 'posts',
      effect: 'DENY',
      priority: 10,
      conditions: validLeaf,
    });
    expect(result.success).toBe(true);
  });

  it('should default priority to 0', () => {
    const result = CreatePolicySchema.safeParse({
      name: 'test',
      resource: 'posts',
      effect: 'DENY',
      conditions: validLeaf,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priority).toBe(0);
  });

  it('should accept FILTER effect', () => {
    const result = CreatePolicySchema.safeParse({
      name: 'Filter read',
      resource: 'posts',
      effect: 'FILTER',
      conditions: validLeaf,
    });
    expect(result.success).toBe(true);
  });

  it('should reject an unknown effect', () => {
    const result = CreatePolicySchema.safeParse({
      name: 'test',
      resource: 'posts',
      effect: 'ALLOW',
      conditions: validLeaf,
    });
    expect(result.success).toBe(false);
  });

  it('should reject an empty name', () => {
    const result = CreatePolicySchema.safeParse({
      name: '',
      resource: 'posts',
      effect: 'DENY',
      conditions: validLeaf,
    });
    expect(result.success).toBe(false);
  });

  it('should reject a name longer than 200 characters', () => {
    const result = CreatePolicySchema.safeParse({
      name: 'a'.repeat(201),
      resource: 'posts',
      effect: 'DENY',
      conditions: validLeaf,
    });
    expect(result.success).toBe(false);
  });

  it('should trim whitespace from name and resource', () => {
    const result = CreatePolicySchema.safeParse({
      name: '  my-policy  ',
      resource: '  posts  ',
      effect: 'DENY',
      conditions: validLeaf,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('my-policy');
      expect(result.data.resource).toBe('posts');
    }
  });

  it('should reject a negative priority', () => {
    const result = CreatePolicySchema.safeParse({
      name: 'test',
      resource: 'posts',
      effect: 'DENY',
      priority: -1,
      conditions: validLeaf,
    });
    expect(result.success).toBe(false);
  });

  it('should reject a non-integer priority', () => {
    const result = CreatePolicySchema.safeParse({
      name: 'test',
      resource: 'posts',
      effect: 'DENY',
      priority: 1.5,
      conditions: validLeaf,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UpdatePolicySchema
// ---------------------------------------------------------------------------

describe('UpdatePolicySchema', () => {
  it('should accept an empty object (all fields optional)', () => {
    const result = UpdatePolicySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept a partial update with only effect', () => {
    const result = UpdatePolicySchema.safeParse({ effect: 'FILTER' });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid effect even in partial mode', () => {
    const result = UpdatePolicySchema.safeParse({ effect: 'ALLOW' });
    expect(result.success).toBe(false);
  });
});
