// apps/core-api/src/modules/authorization/dto/assign-role.dto.ts
//
// Spec 003 §8 request shapes, Task 2.5

import { z } from 'zod';

export const AssignRoleSchema = z.object({
  roleId: z.string().uuid('Role ID must be a valid UUID'),
});

export type AssignRoleDto = z.infer<typeof AssignRoleSchema>;
