// common.ts
// Shared types used across admin and tenant API responses.
// @plexica/api-types — the single source of truth for API response shapes
// (ADR-029, 2026-08-18).

import { z } from 'zod';

/**
 * Canonical paginated response envelope (Decision 4, 2026-08-18).
 * All paginated endpoints MUST return this shape.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Zod schema for the pagination query parameters.
 * Per-endpoint max caps via `.extend({ pageSize: z.coerce.number().int().min(1).max(N) })`.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;
