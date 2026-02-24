// apps/core-api/src/modules/authorization/dto/create-role.dto.ts
//
// Spec 003 §8 request shapes, Task 2.5

import { z } from 'zod';

export const CreateRoleSchema = z.object({
  name: z
    .string()
    .min(1, 'Role name is required')
    .max(100, 'Role name must not exceed 100 characters')
    .regex(
      /^[a-zA-Z0-9_\-\s]+$/,
      'Role name may only contain letters, numbers, underscores, hyphens, and spaces'
    ),
  description: z.string().max(500, 'Description must not exceed 500 characters').optional(),
  permissionIds: z
    .array(z.string().uuid('Each permission ID must be a valid UUID'))
    .max(200, 'Cannot assign more than 200 permissions to a role')
    .default([]),
});

export type CreateRoleDto = z.infer<typeof CreateRoleSchema>;
