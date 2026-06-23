// schema.ts
// Zod request validation schemas for the workspace-member module.
// Implements: WS-003 (Workspace Member Management)

import { z } from 'zod';

export const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'member', 'viewer']),
});

export const changeMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']),
});

export const memberListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
});
