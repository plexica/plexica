import { prisma } from '../../services/core-api/src/lib/database.js';

export const CRM_MARKETPLACE_SLUG = 'crm';
export const REVIEW_PLUGIN_FIXTURE = {
  slug: 'e2e-review-fixture',
  name: 'E2E Review Fixture',
} as const;
export const DLQ_ENTRY_FIXTURE_ID = '77000000-0000-4000-8000-000000000006';

const FIXTURE_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export async function ensureCrmMarketplaceFixture(): Promise<void> {
  const crm = await prisma.plugin.findUnique({
    where: { slug: CRM_MARKETPLACE_SLUG },
    select: { id: true },
  });
  if (crm === null) {
    throw new Error('CRM marketplace fixture is missing after seed-plugins');
  }
  await prisma.plugin.update({
    where: { id: crm.id },
    data: { status: 'published', reviewStatus: 'approved' },
  });
}

export async function resetPluginReviewFixture(): Promise<void> {
  const fixture = await prisma.plugin.upsert({
    where: { slug: REVIEW_PLUGIN_FIXTURE.slug },
    update: {
      name: REVIEW_PLUGIN_FIXTURE.name,
      status: 'draft',
      reviewStatus: 'pending',
      reviewNotes: null,
      reviewedAt: null,
      reviewedBy: null,
    },
    create: {
      slug: REVIEW_PLUGIN_FIXTURE.slug,
      name: REVIEW_PLUGIN_FIXTURE.name,
      description: 'Deterministic, non-installable plugin review fixture',
      version: '1.0.0',
      author: 'Plexica E2E',
      categories: ['testing'],
      manifest: {},
      status: 'draft',
      reviewStatus: 'pending',
      registryUrl: 'oci://plexica/e2e-review-fixture',
      imageName: 'plexica/e2e-review-fixture',
      imageTag: '1.0.0',
      createdByKeycloakId: FIXTURE_ACTOR_ID,
    },
    select: { id: true },
  });
  await prisma.platformAuditLog.deleteMany({
    where: { action: 'plugin.review', resourceId: fixture.id },
  });
}

export async function resetPendingDlqFixture(): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { status: 'active' },
    select: { id: true },
  });
  const plugin = await prisma.plugin.findUnique({
    where: { slug: CRM_MARKETPLACE_SLUG },
    select: { id: true },
  });
  if (!tenant || !plugin) throw new Error('DLQ fixture ownership is unavailable');
  const installId = '77000000-0000-4000-8000-000000000007';
  const occurredAt = new Date().toISOString();
  const payload = {
    eventId: DLQ_ENTRY_FIXTURE_ID,
    type: 'plexica.plugin.events',
    schemaVersion: 1 as const,
    tenantId: tenant.id,
    occurredAt,
    producer: { kind: 'core' as const, id: 'core' as const },
    correlationId: DLQ_ENTRY_FIXTURE_ID,
    causationId: null,
    payload: { id: DLQ_ENTRY_FIXTURE_ID, fixture: 'ac-06-retry' },
  };
  const normalized = {
    tenantId: tenant.id,
    installId,
    eventId: DLQ_ENTRY_FIXTURE_ID,
    eventType: payload.type,
    schemaVersion: 1,
    payload,
    pluginId: plugin.id,
    errorMessage: 'E2E_DELIVERY_FAILURE',
    retryCount: 3,
    originalTopic: payload.type,
    originalPartition: 0,
    originalOffset: 0n,
    dedupeKey: DLQ_ENTRY_FIXTURE_ID.replaceAll('-', '').padEnd(64, '0'),
    status: 'pending',
    failedAt: new Date(),
    resolvedAt: null,
  };
  await prisma.deadLetterQueue.upsert({
    where: { id: DLQ_ENTRY_FIXTURE_ID },
    update: normalized,
    create: { id: DLQ_ENTRY_FIXTURE_ID, ...normalized },
  });
}

export async function deletePluginReviewFixture(): Promise<void> {
  const fixture = await prisma.plugin.findUnique({
    where: { slug: REVIEW_PLUGIN_FIXTURE.slug },
    select: { id: true },
  });
  if (fixture !== null) {
    await prisma.platformAuditLog.deleteMany({
      where: { action: 'plugin.review', resourceId: fixture.id },
    });
  }
  await prisma.plugin.deleteMany({ where: { slug: REVIEW_PLUGIN_FIXTURE.slug } });
}

export async function deleteDlqFixture(): Promise<void> {
  await prisma.deadLetterQueue.deleteMany({ where: { id: DLQ_ENTRY_FIXTURE_ID } });
}

export async function deleteDlqEventsByPayloadIds(ids: string[]): Promise<void> {
  for (const id of ids) {
    await prisma.deadLetterQueue.deleteMany({
      where: { payload: { path: ['payload', 'id'], equals: id } },
    });
  }
}
