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
  await prisma.deadLetterQueue.upsert({
    where: { id: DLQ_ENTRY_FIXTURE_ID },
    update: {
      eventType: 'plexica.plugin.events',
      payload: { id: DLQ_ENTRY_FIXTURE_ID, fixture: 'ac-06-retry' },
      pluginId: null,
      errorMessage: 'Deterministic E2E delivery failure',
      retryCount: 3,
      status: 'pending',
      failedAt: new Date(),
      resolvedAt: null,
    },
    create: {
      id: DLQ_ENTRY_FIXTURE_ID,
      eventType: 'plexica.plugin.events',
      payload: { id: DLQ_ENTRY_FIXTURE_ID, fixture: 'ac-06-retry' },
      errorMessage: 'Deterministic E2E delivery failure',
      retryCount: 3,
      status: 'pending',
    },
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
