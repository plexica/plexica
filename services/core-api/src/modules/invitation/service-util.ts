// service-util.ts
// Shared helpers for the invitation service flows (create/resend/list). Kept
// in their own file so service.ts and service-create.ts share them without a
// circular import (Rule 4, split mirroring service-accept.ts).

import { config } from '../../lib/config.js';

import type { InvitationDto } from './types.js';

export function expiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + config.INVITATION_EXPIRY_DAYS);
  return d;
}

/**
 * Masks a PII email for API responses to prevent enumeration.
 * "alice@company.com" → "a***@company.com"
 * Keeps the first character of the local part and the full domain.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local === undefined || domain === undefined) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

export function maskInvitation(inv: InvitationDto): InvitationDto {
  return { ...inv, email: maskEmail(inv.email) };
}

export function buildInviteUrl(token: string): string {
  return `${config.APP_URL}/invite/${token}`;
}
