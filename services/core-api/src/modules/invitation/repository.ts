// repository.ts
// Invitation data access layer — Prisma queries scoped to the tenant schema.
// All functions accept `db: unknown` and cast internally.

import type {
  InvitationDto,
  WorkspaceRole,
  InvitationStatus,
  ListInvitationsFilters,
} from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function d(tenantDb: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tenantDb as any;
}

interface InvitationRow {
  id: string;
  email: string;
  workspaceId: string;
  role: string;
  status: string;
  invitedBy: string;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  inviter?: { userId: string; displayName: string | null } | null;
}

function toDto(row: InvitationRow): InvitationDto {
  return {
    id: row.id,
    email: row.email,
    workspaceId: row.workspaceId,
    role: row.role as WorkspaceRole,
    status: row.status as InvitationStatus,
    invitedBy: {
      userId: row.invitedBy,
      displayName: row.inviter?.displayName ?? null,
    },
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

const INCLUDE_INVITER = { inviter: { select: { userId: true, displayName: true } } };

export async function createInvitation(
  tenantDb: unknown,
  data: {
    email: string;
    workspaceId: string;
    role: WorkspaceRole;
    invitedBy: string;
    token: string;
    expiresAt: Date;
  }
): Promise<InvitationDto> {
  const row = await d(tenantDb).invitation.create({
    data: {
      email: data.email,
      workspaceId: data.workspaceId,
      role: data.role,
      invitedBy: data.invitedBy,
      token: data.token,
      expiresAt: data.expiresAt,
      status: 'pending',
    },
    include: INCLUDE_INVITER,
  });
  return toDto(row as InvitationRow);
}

export async function findInvitationByToken(
  tenantDb: unknown,
  token: string
): Promise<InvitationDto | null> {
  const row = await d(tenantDb).invitation.findUnique({
    where: { token },
    include: INCLUDE_INVITER,
  });
  return row ? toDto(row as InvitationRow) : null;
}

export async function findInvitationById(
  tenantDb: unknown,
  id: string
): Promise<InvitationDto | null> {
  const row = await d(tenantDb).invitation.findUnique({
    where: { id },
    include: INCLUDE_INVITER,
  });
  return row ? toDto(row as InvitationRow) : null;
}

export async function findInvitationsByWorkspace(
  tenantDb: unknown,
  workspaceId: string,
  filters: ListInvitationsFilters
): Promise<{ data: InvitationDto[]; total: number }> {
  const { status, page, limit } = filters;
  const skip = (page - 1) * limit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { workspaceId };
  if (status !== undefined) where['status'] = status;

  const [rows, total] = await Promise.all([
    d(tenantDb).invitation.findMany({
      where,
      include: INCLUDE_INVITER,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    d(tenantDb).invitation.count({ where }),
  ]);

  return { data: (rows as InvitationRow[]).map(toDto), total };
}

export async function markAccepted(tenantDb: unknown, id: string): Promise<void> {
  await d(tenantDb).invitation.update({
    where: { id },
    data: { status: 'accepted', acceptedAt: new Date() },
  });
}

export async function updateExpiry(
  tenantDb: unknown,
  id: string,
  newExpiresAt: Date
): Promise<void> {
  await d(tenantDb).invitation.update({
    where: { id },
    data: { expiresAt: newExpiresAt, status: 'pending' },
  });
}

export async function findPendingInvitation(
  tenantDb: unknown,
  email: string,
  workspaceId: string
): Promise<{ id: string } | null> {
  const now = new Date();
  const row = await d(tenantDb).invitation.findFirst({
    where: { email, workspaceId, status: 'pending', expiresAt: { gt: now } },
    select: { id: true },
  });
  return row as { id: string } | null;
}
