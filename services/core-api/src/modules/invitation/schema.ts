// schema.ts
// Zod validation schemas for the invitation module.

import { z } from 'zod';

export const createInvitationSchema = z.object({
  email: z.string().email(),
  workspaceId: z.string().uuid(),
  role: z.enum(['admin', 'member', 'viewer']),
});

export const invitationListQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'expired']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
