// apps/core-api/src/modules/authorization/dto/update-policy.dto.ts
//
// Zod DTO for PUT /v1/policies/:id — partial update of an ABAC policy.
// Spec 003 Task 4.2 — FR-007, FR-008, plan §3.11

import { z } from 'zod';
import { CreatePolicySchema } from './create-policy.dto.js';

// All fields are optional for a PATCH-style update.
// The route uses PUT semantics but allows partial body.
export const UpdatePolicySchema = CreatePolicySchema.partial();

export type UpdatePolicyDto = z.infer<typeof UpdatePolicySchema>;
