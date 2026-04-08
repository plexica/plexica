// email.ts
// SMTP email client using nodemailer.
// Used for sending workspace invitation emails to new users.

import nodemailer from 'nodemailer';

import { config } from './config.js';
import { logger } from './logger.js';

function createTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: false,
    // No auth required in dev — Mailpit accepts unauthenticated connections
  });
}

/**
 * Sends a workspace invitation email to the given address.
 * Throws on SMTP failure — caller is responsible for error handling.
 */
export async function sendInvitationEmail(
  to: string,
  inviteUrl: string,
  tenantName: string
): Promise<void> {
  const transport = createTransport();

  const html = `
    <h1>You've been invited to ${tenantName}</h1>
    <p>Click the link below to accept your invitation and join the workspace:</p>
    <p><a href="${inviteUrl}">${inviteUrl}</a></p>
    <p>This invitation will expire in ${config.INVITATION_EXPIRY_DAYS} days.</p>
    <hr />
    <p style="color:#888;font-size:12px;">If you did not request this invitation, you can safely ignore this email.</p>
  `.trim();

  await transport.sendMail({
    from: config.SMTP_FROM,
    to,
    subject: `You've been invited to ${tenantName}`,
    html,
  });

  logger.info({ to, tenantName }, 'Invitation email sent');
}
