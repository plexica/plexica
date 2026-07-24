// Shared, short-lived lifecycle cache. A failed publication can leave an
// active entry usable for at most four seconds, below the five-second NFR.

import { redis } from './redis.js';

import type { Redis } from 'ioredis';
import type { TenantStatus } from '@prisma/client';

const CACHE_PREFIX = 'tenant:context:';
export const TENANT_CONTEXT_CACHE_TTL_SECONDS = 4;

export interface CachedTenantLifecycle {
  id: string;
  status: TenantStatus;
  version: number;
}

function key(slug: string): string {
  return `${CACHE_PREFIX}${slug}`;
}

export async function invalidateTenantLifecycle(
  slug: string,
  client: Redis = redis
): Promise<void> {
  await client.del(key(slug));
}

export async function readTenantLifecycle(
  slug: string,
  client: Redis = redis
): Promise<CachedTenantLifecycle | null> {
  try {
    const raw = await client.get(key(slug));
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<CachedTenantLifecycle>;
    if (
      typeof value.id !== 'string' ||
      typeof value.version !== 'number' ||
      !['active', 'suspended', 'pending_deletion', 'deleted'].includes(value.status ?? '')
    ) {
      await client.del(key(slug));
      return null;
    }
    return value as CachedTenantLifecycle;
  } catch {
    return null;
  }
}

export async function writeTenantLifecycle(
  slug: string,
  value: CachedTenantLifecycle,
  client: Redis = redis
): Promise<boolean> {
  try {
    await client.setex(key(slug), TENANT_CONTEXT_CACHE_TTL_SECONDS, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function clearTenantLifecycle(slug: string, client: Redis = redis): Promise<void> {
  try {
    await invalidateTenantLifecycle(slug, client);
  } catch {
    // Redis failure degrades to a DB lookup after the bounded cache TTL.
  }
}
