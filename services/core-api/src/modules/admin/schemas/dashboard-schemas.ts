// dashboard-schemas.ts
// Zod validation schema for the super-admin dashboard metrics endpoint.
// Implements: Spec 005, Feature 005-01 (S5-B00 / dashboard overview).
//
// Exposes only aggregate counts and a coarse health status — no per-tenant
// data, no PII, no credentials. Health status reuses the health-schemas enum
// so the dashboard can share rendering logic with the /health endpoint.

import { z } from 'zod';

import { HealthStatusSchema } from './health-schemas.js';

export const HealthStatusEnum = HealthStatusSchema;

export const DashboardMetricsSchema = z.object({
  tenantCount: z.number().int().min(0),
  activeTenantCount: z.number().int().min(0),
  suspendedTenantCount: z.number().int().min(0),
  pendingDeletionCount: z.number().int().min(0),
  pluginCount: z.number().int().min(0),
  activePluginCount: z.number().int().min(0),
  totalUsers: z.number().int().min(0).nullable(),
  workspaceCount: z.number().int().min(0).nullable(),
  dlqDepth: z.number().int().min(0),
  healthStatus: HealthStatusEnum,
});

export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;
