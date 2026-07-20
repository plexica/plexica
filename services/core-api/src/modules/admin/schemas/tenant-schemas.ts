// schemas/tenant-schemas.ts
// Zod schemas for super-admin tenant list endpoint (S5-200 / S5-201).

import { z } from 'zod';

// TenantStatus enum mirrors prisma/schema.prisma (core.TenantStatus).
export const TenantStatusSchema = z.enum([
  'active',
  'suspended',
  'pending_deletion',
  'deleted',
]);

// Query params for GET /api/v1/admin/tenants.
// page defaults to 1, pageSize to 20 (capped at 100 — NFR + DoS guard).
export const TenantListQuerySchema = z.object({
  search: z.string().trim().max(255).optional(),
  status: TenantStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Public tenant fields only — no secrets, no config, no minio bucket name.
export const TenantListItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  status: TenantStatusSchema,
  createdAt: z.coerce.date(),
  version: z.number().int(),
});

export const TenantListResponseSchema = z.object({
  data: z.array(TenantListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
});

export type TenantListQuery = z.infer<typeof TenantListQuerySchema>;
export type TenantListItem = z.infer<typeof TenantListItemSchema>;
export type TenantListResponse = z.infer<typeof TenantListResponseSchema>;
