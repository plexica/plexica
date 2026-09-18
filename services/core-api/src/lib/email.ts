// email.ts
// SMTP email client using nodemailer (feature 006-03). Two delivery paths:
//   - sendMailNow  — synchronous nodemailer send (used by the queue worker);
//   - enqueueEmail — durable retry queue (core.email_queue) — the default for
//                    application emails (ADR-035: durable retry, dead-letter).
// sendInvitationEmail now routes through the queue.

import nodemailer from 'nodemailer';

import { EmailQueueService } from '../modules/notification/email-queue.service.js';

import { config } from './config.js';
import { prisma } from './database.js';
import { logger } from './logger.js';

function createTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: false,
    // Abort a hung SMTP at the socket level BEFORE the worker's Promise.race
    // timeout (sendMailNow, 10s) can reject: nodemailer's native socket
    // timeouts destroy the in-flight connection deterministically, so a retry
    // never runs while the original connection could still deliver (shrinks
    // the at-least-once duplicate window; ADR-035 accepts a sub-second race).
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 8_000,
    // No auth required in dev — Mailpit accepts unauthenticated connections
  });
}

/**
 * Synchronous send. Used only by the email queue worker — callers that want a
 * durable retry path should use enqueueEmail instead.
 * Throws on SMTP failure — the worker decides retry/dead-letter.
 * `timeoutMs` is a backstop on top of the transport's native socket timeouts
 * (8s, see createTransport) so a hung SMTP can never strand a claimed queue
 * row. Delivery semantics are at-least-once (ADR-035): on a truly uncertain
 * SMTP outcome (e.g. the server committed the message but the response was
 * lost) a duplicate email is possible — accepted, prefer a duplicate over a
 * lost email.
 */
export async function sendMailNow(
  to: string,
  subject: string,
  html: string,
  options: { timeoutMs?: number } = {}
): Promise<void> {
  const transport = createTransport();
  const send = transport.sendMail({
    from: config.SMTP_FROM,
    to,
    subject,
    html,
  });
  if (options.timeoutMs === undefined) {
    await send;
    await transport.close();
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Promise.race does not cancel sendMail. transport.close() signals the
      // abort; combined with the transport's native socket timeouts (which
      // fire ~2s before this backstop), the in-flight SMTP connection is
      // destroyed before the worker can retry, shrinking the duplicate window
      // to a sub-second race.
      transport.close();
      reject(new Error('EMAIL_SMTP_TIMEOUT'));
    }, options.timeoutMs);
    timer.unref?.();
  });
  try {
    await Promise.race([send, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await transport.close();
  }
}

export interface EnqueueEmailInput {
  to: string;
  subject: string;
  html: string;
  emailType: string;
  tenantId?: string;
}

/** Enqueues an email into core.email_queue for the durable retry worker. */
export async function enqueueEmail(input: EnqueueEmailInput): Promise<string | null> {
  const service = new EmailQueueService(prisma);
  const id = await service.enqueue({
    ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
    toAddress: input.to,
    subject: input.subject,
    htmlBody: input.html,
    emailType: input.emailType,
  });
  if (id !== null) logger.info({ id, emailType: input.emailType }, 'Email enqueued');
  return id;
}

/** HTML-escapes user-controlled values interpolated into email bodies (CWE-79). */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Renders the invitation accept-link HTML body (shared by enqueue + consumer). */
export function renderInvitationHtml(inviteUrl: string, tenantName: string): string {
  const safeTenant = escapeHtml(tenantName);
  const safeUrl = escapeHtml(inviteUrl);
  return `
    <h1>You've been invited to ${safeTenant}</h1>
    <p>Click the link below to accept your invitation and join the workspace:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>This invitation will expire in ${config.INVITATION_EXPIRY_DAYS} days.</p>
    <hr />
    <p style="color:#888;font-size:12px;">If you did not request this invitation, you can safely ignore this email.</p>
  `.trim();
}

/**
 * Renders and enqueues the workspace invitation email (accept link). The
 * invitation email now flows through the durable retry queue (006-03).
 */
export async function sendInvitationEmail(
  to: string,
  inviteUrl: string,
  tenantName: string,
  tenantId?: string
): Promise<string | null> {
  const html = renderInvitationHtml(inviteUrl, tenantName);

  return enqueueEmail({
    to,
    subject: `You've been invited to ${tenantName}`,
    html,
    emailType: 'workspace.invite',
    ...(tenantId === undefined ? {} : { tenantId }),
  });
}
