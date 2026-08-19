// schema.ts
// Zod validation schemas for user-management request inputs.

import { z } from 'zod';

export const userListQuerySchema = z.object({
  status: z.enum(['active', 'invited', 'disabled']).optional(),
  search: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const removeUserSchema = z.object({
  reassignments: z
    .array(
      z.object({
        workspaceId: z.string().uuid(),
        reassignToUserId: z.string().uuid(),
      })
    )
    .default([]),
});

// Path params for every /api/v1/users/:id* route. `:id` is a user_profile.userId
// (@db.Uuid) — a malformed value must be rejected here with a clean 422
// (ValidationError) rather than reaching Prisma, which throws P2023 for an
// invalid UUID literal and would otherwise surface as an unmapped 500.
export const userIdParamSchema = z.object({
  id: z.string().uuid(),
});
