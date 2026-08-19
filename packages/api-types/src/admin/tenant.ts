// admin/tenant.ts
// Tenant list and detail response schemas (S5-200 / S5-300).
// Extracted from services/core-api/src/modules/admin/schemas/tenant-schemas.ts.

import { z } from 'zod';

export const TenantStatusSchema = z.enum([
  'active',
  'suspended',
  'pending_deletion',
  'deleted',
]);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantListItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  status: TenantStatusSchema,
  createdAt: z.string(),
  version: z.number().int(),
});
export type TenantListItem = z.infer<typeof TenantListItemSchema>;

export const TenantListResponseSchema = z.object({
  data: z.array(TenantListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  totalPages: z.number().int().min(0),
});
export type TenantListResponse = z.infer<typeof TenantListResponseSchema>;

// ── Provisioning (S5-403) ──────────────────────────────────────────────────

export type TenantConflictType =
  | 'tenant_slug_exists'
  | 'schema_exists'
  | 'realm_exists'
  | 'bucket_exists';

export interface ProvisionResult {
  tenantId: string;
  slug: string;
  schemaName: string;
  realmName: string;
  minioBucket: string;
  tempPassword: string;
}

// ── Tenant detail ──────────────────────────────────────────────────────────

export interface TenantDetailPluginInstallation {
  pluginSlug: string;
  status: string;
  installedAt: string;
}

export interface TenantDetail {
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: TenantStatus;
    version: number;
    createdAt: string;
    updatedAt: string;
    minioBucket: string | null;
  };
  userCount: number;
  workspaceCount: number;
  pluginInstallations: TenantDetailPluginInstallation[];
  recentAudit: import('./audit.js').AuditEntry[];
}

// ── Deletion saga ──────────────────────────────────────────────────────────

export type DeletionStepName =
  | 'event_data_purge'
  | 'schema_drop'
  | 'realm_delete'
  | 'bucket_delete';
export type DeletionStepStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface TenantDeletionStepResponse {
  id: string;
  step: DeletionStepName;
  status: DeletionStepStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export interface DeletionStatusResponse {
  steps: TenantDeletionStepResponse[];
}

export interface DeletionRetryResponse {
  step: DeletionStepName;
  status: DeletionStepStatus;
  attempts: number;
}
