// apps/core-api/src/modules/authorization/dto/condition-tree.dto.ts
//
// Recursive Zod schema for ABAC condition trees.
// Spec 003 Task 4.2 — FR-008, plan §4.6
//
// Structure (spec §7 ABAC Condition Schema):
//   LeafCondition   — { attribute, operator, value }
//   AllCombinator   — { all: ConditionNode[] }
//   AnyCombinator   — { any: ConditionNode[] }
//   NotCombinator   — { not: ConditionNode }
//
// Zod validates shape only; depth and count limits are enforced by
// ConditionValidatorService after parsing (separation of concerns).

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Leaf condition — single predicate
// ---------------------------------------------------------------------------

export const LeafConditionSchema = z.object({
  attribute: z.string().min(1).max(256),
  operator: z.enum(['equals', 'notEquals', 'contains', 'in', 'greaterThan', 'lessThan', 'exists']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())]),
});

export type LeafConditionDto = z.infer<typeof LeafConditionSchema>;

// ---------------------------------------------------------------------------
// Recursive combinator nodes — must use z.lazy() to allow self-reference
// ---------------------------------------------------------------------------

// Forward-declare the union type for recursion
export type ConditionNodeDto =
  | LeafConditionDto
  | { all: ConditionNodeDto[] }
  | { any: ConditionNodeDto[] }
  | { not: ConditionNodeDto };

// The recursive schema. z.lazy() defers evaluation so the schema can reference
// itself without causing a circular reference at module load time.
export const ConditionNodeSchema: z.ZodType<ConditionNodeDto> = z.lazy(() =>
  z.union([
    LeafConditionSchema,
    z.object({ all: z.array(ConditionNodeSchema).min(1).max(50) }),
    z.object({ any: z.array(ConditionNodeSchema).min(1).max(50) }),
    z.object({ not: ConditionNodeSchema }),
  ])
);

// Top-level ConditionTree is the same union (a root node is itself a condition node)
export const ConditionTreeSchema: z.ZodType<ConditionNodeDto> = ConditionNodeSchema;

export type ConditionTreeDto = ConditionNodeDto;
