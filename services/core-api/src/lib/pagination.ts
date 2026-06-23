// pagination.ts
// Generic pagination utilities for Prisma queries and API responses.

import { z } from 'zod';

export interface PaginationParams {
  page: number; // 1-indexed
  limit: number; // max 100
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Returns { skip, take } arguments for a Prisma findMany query. */
export function buildPaginationClause(params: PaginationParams): { skip: number; take: number } {
  return {
    skip: (params.page - 1) * params.limit,
    take: params.limit,
  };
}

/** Wraps a Prisma result array in the standard paginated response envelope. */
export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  return {
    data,
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}

/** Zod schema for validating pagination query string parameters. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
