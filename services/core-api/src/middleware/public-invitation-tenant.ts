import { InvitationNotFoundError } from '../lib/app-error.js';
import { prisma } from '../lib/database.js';
import { tenantSlugFromHost } from '../lib/tenant-host.js';
import { enterWithTenant } from '../lib/tenant-context-store.js';
import { toRealmName, toSchemaName } from '../lib/tenant-schema-helpers.js';

import type { FastifyReply, FastifyRequest } from 'fastify';

/** Resolves public capability requests from Host only; tenant headers are ignored. */
export async function publicInvitationTenantResolver(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const slug = tenantSlugFromHost(request.headers.host);
  if (slug === null) throw new InvitationNotFoundError();

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, status: true },
  });
  if (tenant === null || tenant.status !== 'active') {
    throw new InvitationNotFoundError();
  }

  const tenantContext = {
    tenantId: tenant.id,
    slug: tenant.slug,
    schemaName: toSchemaName(tenant.slug),
    realmName: toRealmName(tenant.slug),
  };
  enterWithTenant(tenantContext);
  request.tenantContext = tenantContext;
}
