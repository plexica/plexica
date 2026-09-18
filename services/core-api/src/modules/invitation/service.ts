// service.ts
// Invitation service — resend and list flows. The create flow lives in
// service-create.ts (split for 200-line compliance, mirroring service-accept.ts)
// and is re-exported here so existing import sites are unaffected.

import { sendInvitationEmail } from '../../lib/email.js';
import { InvitationNotFoundError, InvitationAlreadyAcceptedError } from '../../lib/app-error.js';
import { writeAuditLog } from '../audit-log/writer.js';

import { findInvitationById, findInvitationsByWorkspace, updateExpiry } from './repository.js';
import { buildInviteUrl, expiryDate, maskInvitation } from './service-util.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { TenantDbClient, TenantPrismaClient } from '../../lib/tenant-database.js';
import type { PaginatedResult } from '../../lib/pagination.js';
import type { InvitationDto, ListInvitationsFilters } from './types.js';

export { createInvitationService } from './service-create.js';

// TenantPrismaClient (non-transactional): writes the audit log.
export async function resendInvitationService(
  tenantDb: TenantPrismaClient,
  invitationId: string,
  actorId: string,
  tenantContext: TenantContext
): Promise<InvitationDto> {
  const invitation = await findInvitationById(tenantDb, invitationId);
  if (invitation === null) throw new InvitationNotFoundError();
  if (invitation.status === 'accepted') throw new InvitationAlreadyAcceptedError();

  const newExpiresAt = expiryDate();
  await updateExpiry(tenantDb, invitationId, newExpiresAt);

  const updated = await findInvitationById(tenantDb, invitationId);
  if (updated === null) throw new InvitationNotFoundError();

  const inviteUrl = buildInviteUrl(await getToken(tenantDb, invitationId));
  await sendInvitationEmail(updated.email, inviteUrl, tenantContext.slug, tenantContext.tenantId);

  await writeAuditLog(tenantDb, {
    actorId,
    actionType: 'invitation.resend',
    targetType: 'invitation',
    targetId: invitationId,
  });

  return maskInvitation(updated);
}

async function getToken(tenantDb: TenantDbClient, id: string): Promise<string> {
  const row = await tenantDb.invitation.findUnique({
    where: { id },
    select: { token: true },
  });
  return row?.token ?? '';
}

export async function listInvitationsService(
  tenantDb: TenantDbClient,
  workspaceId: string,
  filters: ListInvitationsFilters
): Promise<PaginatedResult<InvitationDto>> {
  const result = await findInvitationsByWorkspace(tenantDb, workspaceId, filters);
  return { ...result, data: result.data.map(maskInvitation) };
}
