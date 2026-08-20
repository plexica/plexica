// admin/dashboard.ts
// Super-admin dashboard metrics response schema (S5-B00).
// Extracted from services/core-api/src/modules/admin/schemas/dashboard-schemas.ts.

import { z } from 'zod';

import { HealthStatusSchema } from './health.js';

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
  healthStatus: HealthStatusSchema,
});
export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;
