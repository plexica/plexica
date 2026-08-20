// pagination.ts
// Generic pagination utilities for Prisma queries and API responses.
//
// Canonical envelope (Decision 4, 2026-08-18): { data, total, page, pageSize, totalPages }.
// All paginated endpoints MUST use buildPaginatedResult — no hand-built envelopes.
// See .forge/knowledge/decision-log.md → Fase 5 Decision 4.

import { z } from 'zod';

interface PaginationParams {
  page: number; // 1-indexed
  pageSize: number; // max per endpoint (use .extend() to tighten)
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Returns { skip, take } arguments for a Prisma findMany query. */
export function buildPaginationClause(params: PaginationParams): { skip: number; take: number } {
  return {
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
  };
}

/** Wraps a Prisma result array in the canonical paginated response envelope. */
export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  return {
    data,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}

/**
 * Zod schema for validating pagination query string parameters.
 * Per-endpoint max caps: `.extend({ pageSize: z.coerce.number().int().min(1).max(N) })`.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
