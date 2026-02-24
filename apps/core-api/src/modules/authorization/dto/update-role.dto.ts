// apps/core-api/src/modules/authorization/dto/update-role.dto.ts
//
// Spec 003 §8 request shapes, Task 2.5

import { z } from 'zod';
import { CreateRoleSchema } from './create-role.dto.js';

export const UpdateRoleSchema = CreateRoleSchema.partial();

export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
