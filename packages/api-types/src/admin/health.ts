// admin/health.ts
// System health check response schemas (S5-100 / S5-101).
// Extracted from services/core-api/src/modules/admin/schemas/health-schemas.ts.

import { z } from 'zod';

export const HealthStatusSchema = z.enum(['healthy', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthServiceResultSchema = z.object({
  name: z.string().min(1),
  status: HealthStatusSchema,
  latencyMs: z.number().int().min(0),
});
export type HealthServiceResult = z.infer<typeof HealthServiceResultSchema>;

export const HealthResponseSchema = z.object({
  services: z.array(HealthServiceResultSchema),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
