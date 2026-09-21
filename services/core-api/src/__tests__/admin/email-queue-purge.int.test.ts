// email-queue-purge.int.test.ts
// INT (F8 / feature 006-03): the tenant deletion saga's `email_queue_purge`
// step erases every pending core.email_queue row for the tenant (GDPR PII
// erasure + worker suppression) and the step is marked done. Executes the REAL
// step via executeStepWithRetry against a real DB.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { executeStepWithRetry } from '../../modules/admin/services/deletion-step-executor.js';
import { captureDeletionContext } from '../../modules/admin/services/deletion-context.service.js';
import { enqueueEmailRaw } from '../../modules/notification/email-queue.service.js';
import { isDbReachable } from '../helpers/server.helpers.js';

const SLUG = `email-queue-purge-${process.pid}`;

const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let tenantId = '';

beforeAll(async () => {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing !== null) {
    await prisma.$transaction(async (tx) => {
      await tx.tenantDeletionStep.deleteMany({ where: { tenantId: existing.id } });
      await tx.tenantConfig.deleteMany({ where: { tenantId: existing.id } });
      await tx.tenant.delete({ where: { id: existing.id } });
    });
  }
  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: 'Email queue purge test' },
  });
  tenantId = tenant.id;
});

afterAll(async () => {
  await prisma.emailQueue.deleteMany({ where: { tenantId } });
  await prisma.tenantDeletionStep.deleteMany({ where: { tenantId } });
  await prisma.tenantConfig.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('email_queue_purge deletion step (F8)', () => {
  skipIfNoDb('purges pending email_queue rows and completes the step', async () => {
    // Seed pending rows in every status the purge must erase (PII erasure).
    await enqueueEmailRaw(prisma, {
      tenantId,
      toAddress: 'pending@test.plexica.io',
      subject: 'Pending',
      htmlBody: '<p>PII</p>',
      emailType: 'workspace.invite',
      eventId: crypto.randomUUID(),
    });
    await enqueueEmailRaw(prisma, {
      tenantId,
      toAddress: 'sending@test.plexica.io',
      subject: 'Sending',
      htmlBody: '<p>PII</p>',
      emailType: 'notification',
      eventId: crypto.randomUUID(),
    });
    await prisma.emailQueue.updateMany({
      where: { tenantId, toAddress: 'sending@test.plexica.io' },
      data: { status: 'sending' },
    });

    expect(await prisma.emailQueue.count({ where: { tenantId } })).toBe(2);

    const step = await prisma.tenantDeletionStep.create({
      data: { tenantId, step: 'email_queue_purge', status: 'pending' },
    });
    const context = await captureDeletionContext(prisma, tenantId);

    const completed = await executeStepWithRetry(prisma, step, context);

    expect(completed).toBe(true);
    expect(await prisma.emailQueue.count({ where: { tenantId } })).toBe(0);
    const done = await prisma.tenantDeletionStep.findUnique({ where: { id: step.id } });
    expect(done?.status).toBe('done');
  });
});