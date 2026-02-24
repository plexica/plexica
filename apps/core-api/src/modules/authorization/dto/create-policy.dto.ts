// apps/core-api/src/modules/authorization/dto/create-policy.dto.ts
//
// Zod DTO for POST /v1/policies — create a new ABAC policy.
// Spec 003 Task 4.2 — FR-007, FR-008, plan §3.10

import { z } from 'zod';
import { ConditionTreeSchema } from './condition-tree.dto.js';

export const CreatePolicySchema = z.object({
  name: z.string().min(1).max(200).trim(),
  resource: z.string().min(1).max(200).trim(),
  effect: z.enum(['DENY', 'FILTER']),
  priority: z.number().int().min(0).default(0),
  conditions: ConditionTreeSchema,
});

export type CreatePolicyDto = z.infer<typeof CreatePolicySchema>;
