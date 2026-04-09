// schema.ts
// Zod validation schemas for user-management request inputs.

import { z } from 'zod';

export const userListQuerySchema = z.object({
  status: z.enum(['active', 'invited', 'disabled']).optional(),
  search: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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
