// apps/core-api/src/modules/authorization/condition-validator.service.ts
//
// Validates ABAC condition trees for depth, count, and payload size limits.
// Spec 003 Task 4.3 — FR-008, Edge Case #12, plan §4.6
//
// Zod validates shape; this service enforces semantic constraints:
//   - Max nesting depth: 5
//   - Max leaf conditions: 20
//   - Max JSONB payload: 64 KB (65 536 bytes)
//
// Constitution Compliance:
//   - Art. 1.2 / 5.3: No user input reaches SQL; validation is pure logic
//   - Art. 2.1: Strict TypeScript, no `any`

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Error code returned in 422 responses (matches spec §8 error codes) */
export const CONDITION_TREE_LIMIT_EXCEEDED = 'CONDITION_TREE_LIMIT_EXCEEDED';

const MAX_DEPTH = 5;
const MAX_CONDITIONS = 20;
const MAX_PAYLOAD_BYTES = 65_536;

export class ConditionValidatorService {
  /**
   * Validate a condition tree object that has already been parsed by Zod.
   * Returns { valid: true } or { valid: false, errors: [...] }.
   */
  validate(conditions: unknown): ValidationResult {
    const errors: string[] = [];

    // Payload size check (fast-path before traversal)
    const serialized = JSON.stringify(conditions);
    const byteLength = Buffer.byteLength(serialized, 'utf8');
    if (byteLength > MAX_PAYLOAD_BYTES) {
      errors.push(
        `Condition tree payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes ` +
          `(got ${byteLength} bytes)`
      );
    }

    // Depth check
    const depth = this.measureDepth(conditions, 0);
    if (depth > MAX_DEPTH) {
      errors.push(`Condition tree exceeds maximum nesting depth of ${MAX_DEPTH} (got ${depth})`);
    }

    // Leaf count check
    const count = this.countConditions(conditions);
    if (count > MAX_CONDITIONS) {
      errors.push(
        `Condition tree exceeds maximum of ${MAX_CONDITIONS} leaf conditions (got ${count})`
      );
    }

    return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
  }

  /**
   * Recursive DFS that returns the maximum depth of this node.
   * A leaf counts as depth 1; combinators add 1 for the combinator level
   * and then recurse into children.
   *
   * @param node   - The condition node (already Zod-parsed, so shape is valid)
   * @param depth  - Accumulated depth of the caller (used to detect depth > MAX early)
   */
  measureDepth(node: unknown, depth: number = 0): number {
    if (!node || typeof node !== 'object') return depth;

    const n = node as Record<string, unknown>;

    // Combinator: all / any
    if (Array.isArray(n['all'])) {
      return Math.max(
        depth + 1,
        ...(n['all'] as unknown[]).map((child) => this.measureDepth(child, depth + 1))
      );
    }
    if (Array.isArray(n['any'])) {
      return Math.max(
        depth + 1,
        ...(n['any'] as unknown[]).map((child) => this.measureDepth(child, depth + 1))
      );
    }
    // Combinator: not (single child)
    if ('not' in n) {
      return this.measureDepth(n['not'], depth + 1);
    }

    // Leaf condition (has 'attribute' key)
    if ('attribute' in n) {
      return depth + 1;
    }

    return depth;
  }

  /**
   * Recursively counts the number of leaf conditions in the tree.
   */
  countConditions(node: unknown): number {
    if (!node || typeof node !== 'object') return 0;

    const n = node as Record<string, unknown>;

    if (Array.isArray(n['all'])) {
      return (n['all'] as unknown[]).reduce(
        (sum: number, child) => sum + this.countConditions(child),
        0
      );
    }
    if (Array.isArray(n['any'])) {
      return (n['any'] as unknown[]).reduce(
        (sum: number, child) => sum + this.countConditions(child),
        0
      );
    }
    if ('not' in n) {
      return this.countConditions(n['not']);
    }
    // Leaf
    if ('attribute' in n) {
      return 1;
    }

    return 0;
  }
}

/** Singleton instance — imported by PolicyService and route handlers */
export const conditionValidatorService = new ConditionValidatorService();
