import { randomBytes } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

import { unwrapEventKey, wrapEventKey } from './event-crypto.js';

import type { PrismaClient } from '@prisma/client';

let ephemeralMasterKey: Buffer | undefined;

function decodeMasterKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64url');
  if (key.byteLength !== 32) {
    throw new Error('EVENT_KEY_ENCRYPTION_KEY must encode exactly 32 bytes');
  }
  return key;
}

function masterKey(): Buffer {
  if (config.EVENT_KEY_ENCRYPTION_KEY) return decodeMasterKey(config.EVENT_KEY_ENCRYPTION_KEY);
  if (config.NODE_ENV === 'production') {
    throw new Error('EVENT_KEY_ENCRYPTION_KEY is required in production');
  }
  if (!ephemeralMasterKey) {
    ephemeralMasterKey = randomBytes(32);
    logger.warn('Using an ephemeral event wrapping key outside production');
  }
  return ephemeralMasterKey;
}

function unwrap(row: {
  tenantId: string;
  keyVersion: number;
  wrappedKey: Uint8Array | null;
  wrapIv: Uint8Array | null;
  wrapTag: Uint8Array | null;
}): Buffer {
  if (!row.wrappedKey || !row.wrapIv || !row.wrapTag) {
    throw new Error('Tenant event key material is unavailable');
  }
  return unwrapEventKey(
    { wrappedKey: row.wrappedKey, wrapIv: row.wrapIv, wrapTag: row.wrapTag },
    masterKey(),
    row.tenantId,
    row.keyVersion
  );
}

async function ensureTenantEventKeyLocked(
  prisma: Prisma.TransactionClient,
  tenantId: string
): Promise<{ keyVersion: number; key: Buffer }> {
  const tenant = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status FROM core.tenants
    WHERE id = ${tenantId}::uuid FOR UPDATE
  `;
  if (tenant[0]?.status !== 'active') throw new Error('TENANT_NOT_ACTIVE');
  const existing = await prisma.tenantEventKey.findFirst({
    where: { tenantId, status: 'active' },
  });
  if (existing) {
    try {
      return { keyVersion: existing.keyVersion, key: unwrap(existing) };
    } catch (error) {
      if (config.EVENT_KEY_ENCRYPTION_KEY) throw error;
      await prisma.tenantEventKey.updateMany({
        where: { tenantId, keyVersion: existing.keyVersion, status: 'active' },
        data: {
          status: 'destroyed',
          wrappedKey: null,
          wrapIv: null,
          wrapTag: null,
          destroyedAt: new Date(),
        },
      });
      logger.warn({ tenantId }, 'Rotating unreadable ephemeral tenant event key');
    }
  }

  const latest = await prisma.tenantEventKey.aggregate({
    where: { tenantId },
    _max: { keyVersion: true },
  });
  const keyVersion = (latest._max.keyVersion ?? 0) + 1;
  const wrapped = wrapEventKey(randomBytes(32), masterKey(), tenantId, keyVersion);
  try {
    const created = await prisma.tenantEventKey.create({
      data: {
        tenantId,
        keyVersion,
        status: 'active',
        wrappedKey: Uint8Array.from(wrapped.wrappedKey),
        wrapIv: Uint8Array.from(wrapped.wrapIv),
        wrapTag: Uint8Array.from(wrapped.wrapTag),
      },
    });
    return { keyVersion, key: unwrap(created) };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
    const raced = await prisma.tenantEventKey.findFirst({
      where: { tenantId, status: 'active' },
    });
    if (!raced) throw error;
    return { keyVersion: raced.keyVersion, key: unwrap(raced) };
  }
}

export async function ensureTenantEventKey(
  prisma: PrismaClient,
  tenantId: string
): Promise<{ keyVersion: number; key: Buffer }> {
  return prisma.$transaction((tx) => ensureTenantEventKeyLocked(tx, tenantId));
}

export async function getTenantEventKey(
  prisma: PrismaClient,
  tenantId: string,
  keyVersion: number
): Promise<Buffer> {
  const row = await prisma.tenantEventKey.findUnique({
    where: { tenantId_keyVersion: { tenantId, keyVersion } },
  });
  if (!row || row.status !== 'active') throw new Error('Tenant event key is unavailable');
  return unwrap(row);
}

export async function provisionTenantEventKeys(prisma: PrismaClient): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'active' },
    select: { id: true },
  });
  for (const tenant of tenants) await ensureTenantEventKey(prisma, tenant.id);
}

export async function destroyTenantEventKeys(
  prisma: PrismaClient,
  tenantId: string,
  destroyedAt = new Date()
): Promise<number> {
  const result = await prisma.tenantEventKey.updateMany({
    where: { tenantId, status: 'active' },
    data: {
      status: 'destroyed',
      wrappedKey: null,
      wrapIv: null,
      wrapTag: null,
      destroyedAt,
    },
  });
  return result.count;
}
