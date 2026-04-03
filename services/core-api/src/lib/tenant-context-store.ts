// tenant-context-store.ts
// AsyncLocalStorage wrapper for per-request tenant context isolation.
// Provides type-safe access to tenant data within the request lifecycle.

import { AsyncLocalStorage } from 'node:async_hooks';

import { InvalidTenantContextError } from './app-error.js';

export interface TenantContext {
  tenantId: string;
  slug: string;
  schemaName: string;
  realmName: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Returns the current tenant context for this async execution.
 * Throws InvalidTenantContextError if called outside a tenant request scope.
 */
export function getTenantContext(): TenantContext {
  const context = storage.getStore();
  if (context === undefined) {
    throw new InvalidTenantContextError('No tenant context found in current execution scope');
  }
  return context;
}

/**
 * Runs the provided async function within the given tenant context.
 * The context is available via getTenantContext() within the function.
 */
export async function runWithTenant<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

/**
 * Enters the given tenant context for the remainder of the current async execution.
 * Uses AsyncLocalStorage.enterWith() which persists through all subsequent async
 * operations in the current execution tree without requiring a callback wrapper.
 *
 * H-1 fix: call this in Fastify preHandler hooks so that getTenantContext() and
 * withTenantDb() work correctly in route handlers without explicit param drilling.
 */
export function enterWithTenant(context: TenantContext): void {
  storage.enterWith(context);
}
