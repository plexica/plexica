// repository.ts
// Invitation data access layer — Prisma queries scoped to the tenant schema.
// All functions accept a TenantDbClient (plain or transaction client, ADR-028).

import { buildPaginatedResult } from '../../lib/pagination.js';

import type { PaginatedResult } from '../../lib/pagination.js';
import type { TenantDbClient, TenantPrisma } from '../../lib/tenant-database.js';
import type {
  InvitationDto,
  WorkspaceRole,
  InvitationStatus,
  ListInvitationsFilters,
} from './types.js';

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
  tenantDb: TenantDbClient,
  data: {
    email: string;
    workspaceId: string;
    role: WorkspaceRole;
    invitedBy: string;
    token: string;
    expiresAt: Date;
  }
): Promise<InvitationDto> {
  const row = await tenantDb.invitation.create({
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
  return toDto(row);
}

export async function findInvitationByToken(
  tenantDb: TenantDbClient,
  token: string
): Promise<InvitationDto | null> {
  const row = await tenantDb.invitation.findUnique({
    where: { token },
    include: INCLUDE_INVITER,
  });
  return row ? toDto(row) : null;
}

export async function findInvitationById(
  tenantDb: TenantDbClient,
  id: string
): Promise<InvitationDto | null> {
  const row = await tenantDb.invitation.findUnique({
    where: { id },
    include: INCLUDE_INVITER,
  });
  return row ? toDto(row) : null;
}

export async function findInvitationsByWorkspace(
  tenantDb: TenantDbClient,
  workspaceId: string,
  filters: ListInvitationsFilters
): Promise<PaginatedResult<InvitationDto>> {
  const { status, page, pageSize } = filters;
  const skip = (page - 1) * pageSize;
  const where: TenantPrisma.InvitationWhereInput = { workspaceId };
  if (status !== undefined) where.status = status;

  const [rows, total] = await Promise.all([
    tenantDb.invitation.findMany({
      where,
      include: INCLUDE_INVITER,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    tenantDb.invitation.count({ where }),
  ]);

  return buildPaginatedResult(rows.map(toDto), total, { page, pageSize });
}

export async function markAccepted(tenantDb: TenantDbClient, id: string): Promise<void> {
  await tenantDb.invitation.update({
    where: { id },
    data: { status: 'accepted', acceptedAt: new Date() },
  });
}

export async function updateExpiry(
  tenantDb: TenantDbClient,
  id: string,
  newExpiresAt: Date
): Promise<void> {
  await tenantDb.invitation.update({
    where: { id },
    data: { expiresAt: newExpiresAt, status: 'pending' },
  });
}

export async function findPendingInvitation(
  tenantDb: TenantDbClient,
  email: string,
  workspaceId: string
): Promise<{ id: string } | null> {
  const now = new Date();
  return tenantDb.invitation.findFirst({
    where: { email, workspaceId, status: 'pending', expiresAt: { gt: now } },
    select: { id: true },
  });
}
