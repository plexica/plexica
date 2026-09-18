// service-create.ts
// Invitation create flow (split from service.ts for the 200-line gate, Rule 4,
// mirroring service-accept.ts). The invitation row + the workspace.invite
// outbox event are written in ONE transaction (transactional outbox, ADR-004).

import { buildDomainEvent } from '../../events/event-envelope.js';
import { enqueueEvent } from '../../events/outbox-repository.js';
import { AlreadyExistsError } from '../../lib/app-error.js';
import { generateInviteToken } from '../../lib/crypto.js';
import { renderInvitationHtml } from '../../lib/email.js';
import { writeAuditLog } from '../audit-log/writer.js';
import { enqueueEmailRaw } from '../notification/email-queue.service.js';

import { buildInviteUrl, expiryDate, maskInvitation } from './service-util.js';
import { createInvitation, findPendingInvitation } from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { TenantDbClient, TenantPrismaClient } from '../../lib/tenant-database.js';
import type { CreateInvitationInput, InvitationDto } from './types.js';

async function assertNoActiveInvitation(
  tenantDb: TenantDbClient,
  email: string,
  workspaceId: string
): Promise<void> {
  const pending = await findPendingInvitation(tenantDb, email, workspaceId);
  if (pending !== null) {
    throw new AlreadyExistsError(
      'A pending invitation for this address already exists in the workspace (INVITATION_EXISTS)'
    );
  }
}

/** Tenant profile for the address, or null for a pure email invite. */
async function findTenantUserByEmail(
  tenantDb: TenantDbClient,
  email: string
): Promise<{ userId: string } | null> {
  return tenantDb.userProfile.findFirst({ where: { email }, select: { userId: true } });
}

/** Workspace display name for the domain event payload (consumer emails need it). */
async function resolveWorkspaceName(
  tenantDb: TenantDbClient,
  workspaceId: string
): Promise<string> {
  const workspace = await tenantDb.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  return workspace?.name ?? workspaceId;
}

// TenantPrismaClient (non-transactional): writes the audit log after COMMIT.
export async function createInvitationService(
  tenantDb: TenantPrismaClient,
  input: CreateInvitationInput,
  actorId: string,
  tenantContext: TenantContext
): Promise<InvitationDto> {
  await assertNoActiveInvitation(tenantDb, input.email, input.workspaceId);

  // Invitee lookup doubles as the member check and the email-path decision.
  const inviteeProfile = await findTenantUserByEmail(tenantDb, input.email);
  if (inviteeProfile !== null) {
    const member = await tenantDb.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: input.workspaceId, userId: inviteeProfile.userId },
      },
      select: { userId: true },
    });
    if (member !== null) {
      throw new AlreadyExistsError(
        `User is already a member of this workspace (USER_ALREADY_IN_TENANT)`
      );
    }
  }

  const token = generateInviteToken();
  const expiresAt = expiryDate();

  // Invitation create + outbox enqueue + (non-tenant) email enqueue are one
  // atomic unit (transactional outbox, ADR-004): the invite event and the
  // accept-link email cannot be lost if the row commits. The email is enqueued
  // INSIDE the tx — a crash after commit can no longer leave a non-tenant
  // invitee without email (006-03). Cross-schema write (core.email_queue) via
  // raw SQL, same pattern as outbox-repository.enqueueEvent.
  const invitation = await tenantDb.$transaction(async (tx) => {
    const created = await createInvitation(tx, {
      email: input.email,
      workspaceId: input.workspaceId,
      role: input.role,
      invitedBy: actorId,
      token,
      expiresAt,
    });

    const inviteEvent = buildDomainEvent({
      // Full prefixed type — matches the workspace.service.ts pattern
      // ('plexica.workspace.created') and the consumer routing on
      // event.type === 'plexica.workspace.invite' (ADR-004 envelope type).
      type: 'plexica.workspace.invite',
      tenantId: tenantContext.tenantId,
      producer: { kind: 'core', id: 'core' },
      payload: {
        workspaceId: created.workspaceId,
        workspaceName: await resolveWorkspaceName(tx, created.workspaceId),
        inviteeEmail: input.email,
        invitedBy: actorId,
        role: input.role,
      },
    });
    await enqueueEvent(tx, 'plexica.workspace.invite', inviteEvent);

    // Email-only path (006-03): a non-tenant invitee has no preferences, so the
    // accept-link email is enqueued here atomically. Keyed by the SAME domain
    // eventId the consumer later uses for a now-tenant user — if the invitee
    // registers before the consumer processes the event, both enqueues collide
    // on the same dedupe_key (ON CONFLICT DO NOTHING) and no double email is
    // sent. For tenant users the notification consumer decides the email
    // channel from notification_prefs — enqueuing it here too would double-send.
    if (inviteeProfile === null) {
      const inviteUrl = buildInviteUrl(token);
      await enqueueEmailRaw(tx, {
        tenantId: tenantContext.tenantId,
        toAddress: input.email,
        subject: `You've been invited to ${tenantContext.slug}`,
        htmlBody: renderInvitationHtml(inviteUrl, tenantContext.slug),
        emailType: 'workspace.invite',
        eventId: inviteEvent.eventId,
      });
    }
    return created;
  });

  await writeAuditLog(tenantDb, {
    actorId,
    actionType: 'invitation.send',
    targetType: 'invitation',
    targetId: invitation.id,
  });

  return maskInvitation(invitation);
}
