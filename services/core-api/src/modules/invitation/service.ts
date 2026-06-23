// service.ts
// Invitation service — create, resend, and list flows.
// The accept flow is in service-accept.ts (split for 200-line compliance).

import { config } from '../../lib/config.js';
import { generateInviteToken } from '../../lib/crypto.js';
import { sendInvitationEmail } from '../../lib/email.js';
import {
  AlreadyExistsError,
  InvitationNotFoundError,
  InvitationAlreadyAcceptedError,
} from '../../lib/app-error.js';
import { writeAuditLog } from '../audit-log/writer.js';

import {
  createInvitation,
  findInvitationById,
  findInvitationsByWorkspace,
  findPendingInvitation,
  updateExpiry,
} from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { CreateInvitationInput, InvitationDto, ListInvitationsFilters } from './types.js';

function expiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + config.INVITATION_EXPIRY_DAYS);
  return d;
}

/**
 * Masks a PII email for API responses to prevent enumeration.
 * "alice@company.com" → "a***@company.com"
 * Keeps the first character of the local part and the full domain.
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local === undefined || domain === undefined) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

function maskInvitation(inv: InvitationDto): InvitationDto {
  return { ...inv, email: maskEmail(inv.email) };
}

function buildInviteUrl(token: string): string {
  return `${config.APP_URL}/invite/${token}`;
}

async function assertNoActiveInvitation(
  tenantDb: unknown,
  email: string,
  workspaceId: string
): Promise<void> {
  const existing = await findPendingInvitation(tenantDb, email, workspaceId);
  if (existing !== null) {
    throw new AlreadyExistsError(
      `A pending invitation for ${email} in this workspace already exists (INVITATION_EXISTS)`
    );
  }
}

async function assertNotAlreadyMember(
  tenantDb: unknown,
  email: string,
  workspaceId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = tenantDb as any;
  const profile = await db.userProfile.findFirst({
    where: { email },
    select: { userId: true },
  });
  if (profile === null || profile === undefined) return;

  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: profile.userId } },
    select: { userId: true },
  });
  if (member !== null && member !== undefined) {
    throw new AlreadyExistsError(
      `User is already a member of this workspace (USER_ALREADY_IN_TENANT)`
    );
  }
}

export async function createInvitationService(
  tenantDb: unknown,
  input: CreateInvitationInput,
  actorId: string,
  tenantContext: TenantContext
): Promise<InvitationDto> {
  await assertNoActiveInvitation(tenantDb, input.email, input.workspaceId);
  await assertNotAlreadyMember(tenantDb, input.email, input.workspaceId);

  const token = generateInviteToken();
  const expiresAt = expiryDate();

  const invitation = await createInvitation(tenantDb, {
    email: input.email,
    workspaceId: input.workspaceId,
    role: input.role,
    invitedBy: actorId,
    token,
    expiresAt,
  });

  const inviteUrl = buildInviteUrl(token);
  await sendInvitationEmail(input.email, inviteUrl, tenantContext.slug);

  writeAuditLog(tenantDb, {
    actorId,
    actionType: 'invitation.send',
    targetType: 'invitation',
    targetId: invitation.id,
  });

  return maskInvitation(invitation);
}

export async function resendInvitationService(
  tenantDb: unknown,
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

  const inviteUrl = buildInviteUrl(
    // Token stored in DB — re-fetch via repository; use same token
    // We need the token but InvitationDto doesn't expose it.
    // Re-use a direct query here via the cast db.
    await getToken(tenantDb, invitationId)
  );

  await sendInvitationEmail(updated.email, inviteUrl, tenantContext.slug);

  writeAuditLog(tenantDb, {
    actorId,
    actionType: 'invitation.resend',
    targetType: 'invitation',
    targetId: invitationId,
  });

  return maskInvitation(updated);
}

async function getToken(tenantDb: unknown, id: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (tenantDb as any).invitation.findUnique({
    where: { id },
    select: { token: true },
  });
  return (row?.token as string) ?? '';
}

export async function listInvitationsService(
  tenantDb: unknown,
  workspaceId: string,
  filters: ListInvitationsFilters
): Promise<{ data: InvitationDto[]; total: number }> {
  const result = await findInvitationsByWorkspace(tenantDb, workspaceId, filters);
  return { data: result.data.map(maskInvitation), total: result.total };
}
