// mailpit.ts
// Mailpit REST API helpers for invitation-flow E2E tests.
// Mailpit is the SMTP mock server used in local dev / CI.
// API docs: http://localhost:8025 (Mailpit UI)

const MAILPIT_BASE = process.env['PLAYWRIGHT_MAILPIT_URL'] ?? 'http://localhost:8025';

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: Array<{ Address: string; Name: string }>;
  Created: string;
}

interface MailpitListResponse {
  messages: MailpitMessage[];
  total: number;
}

interface MailpitMessageDetail {
  ID: string;
  Subject: string;
  HTML: string;
  Text: string;
}

/**
 * Lists all messages in Mailpit inbox.
 */
export async function listMessages(): Promise<MailpitMessage[]> {
  const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`);
  if (!res.ok) throw new Error(`Mailpit API error: ${String(res.status)}`);
  const data = (await res.json()) as MailpitListResponse;
  return data.messages ?? [];
}

/**
 * Polls Mailpit until a message arrives for the given recipient email.
 * Returns the message or throws after the timeout.
 */
export async function waitForEmail(
  toEmail: string,
  opts: { timeoutMs?: number; pollMs?: number } = {}
): Promise<MailpitMessage> {
  const { timeoutMs = 15_000, pollMs = 500 } = opts;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msgs = await listMessages();
    const found = msgs.find((m) =>
      m.To.some((t) => t.Address.toLowerCase() === toEmail.toLowerCase())
    );
    if (found !== undefined) return found;
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Mailpit: no email for ${toEmail} within ${String(timeoutMs)}ms`);
}

/**
 * Fetches the full body of a message by ID.
 */
export async function getMessage(id: string): Promise<MailpitMessageDetail> {
  const res = await fetch(`${MAILPIT_BASE}/api/v1/message/${id}`);
  if (!res.ok) throw new Error(`Mailpit API error for message ${id}: ${String(res.status)}`);
  return (await res.json()) as MailpitMessageDetail;
}

/**
 * Extracts the invitation accept link from an email body (HTML or plain text).
 * Looks for a URL containing /invitations/accept or /accept.
 */
export function extractInviteLink(body: string): string | null {
  const match = body.match(/https?:\/\/[^\s"'<]+\/(?:invitations\/accept|accept)[^\s"'<]*/);
  return match?.[0] ?? null;
}

/**
 * Deletes all messages in the Mailpit inbox (useful for test isolation).
 */
export async function clearInbox(): Promise<void> {
  await fetch(`${MAILPIT_BASE}/api/v1/messages`, { method: 'DELETE' });
}

export { MAILPIT_BASE };
