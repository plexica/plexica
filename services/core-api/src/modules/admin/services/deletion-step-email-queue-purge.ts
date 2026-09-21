// deletion-step-email-queue-purge.ts
// GDPR deletion-saga step (F8, feature 006-03 / ADR-035): erases every
// core.email_queue row for the tenant (all statuses). Rationale (plan §4.2):
// (a) right-to-erasure of to_address/html_body PII and (b) stopping the email
// worker from sending mail for a deleted tenant. Not FK-ordering — the tenant
// tombstone row is kept, so no FK ever blocks deletion.

import { Prisma } from '@prisma/client';

import type { PrismaClient } from '@prisma/client';

export async function executeEmailQueuePurge(
  prisma: PrismaClient,
  tenantId: string
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM core.email_queue WHERE tenant_id = ${tenantId}::uuid
  `);
  const remaining = await prisma.emailQueue.count({ where: { tenantId } });
  if (remaining !== 0) throw new Error('EMAIL_QUEUE_PURGE_INCOMPLETE');
}
