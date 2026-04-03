// tenant.ts — Shared TypeScript types for tenant context.
// Pure type definitions — no runtime logic.

export interface TenantContext {
  tenantId: string;
  slug: string;
  schemaName: string;
  realmName: string;
}

export interface TenantResolveResponse {
  exists: boolean;
}

export interface TenantInfo {
  slug: string;
  realm: string;
}
