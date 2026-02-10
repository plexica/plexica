// File: packages/types/src/tenant.ts

/**
 * Tenant status values.
 * Uses UPPERCASE to match Prisma/database enum convention.
 */
export const TENANT_STATUSES = [
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'PENDING_DELETION',
  'DELETED',
] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];

/**
 * Tenant entity — the top-level organizational unit.
 * Each tenant has its own isolated database schema, Keycloak realm, and storage.
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
  suspendedAt?: string;
}

/**
 * Tenant context available in request middleware.
 * Resolved from JWT or X-Tenant-Slug header.
 */
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  workspaceId?: string;
  userId?: string;
}
