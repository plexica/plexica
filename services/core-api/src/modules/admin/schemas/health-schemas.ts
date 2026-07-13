// health-schemas.ts
// Zod validation schemas for the system health check endpoint.
// Implements: Spec 005, Feature 005-09 (S5-100 / S5-101)
//
// The response deliberately exposes ONLY: service name, coarse status enum,
// and latency in milliseconds. No connection strings, credentials, error
// messages, or version numbers are leaked (Security §6, spec §7 edge case).

import { z } from 'zod';

export const HealthStatusSchema = z.enum(['healthy', 'degraded', 'down']);

export const HealthServiceResultSchema = z.object({
  name: z.string().min(1),
  status: HealthStatusSchema,
  latencyMs: z.number().int().min(0),
});

export const HealthResponseSchema = z.object({
  services: z.array(HealthServiceResultSchema),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type HealthServiceResult = z.infer<typeof HealthServiceResultSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
