// email-error-sanitize.ts
// PII-safe error detail for core.email_queue.last_error (ADR-035/016: no
// stack, no PII). SMTP 5xx responses echo the recipient address (e.g.
// `5.1.1 <alice@...>: Recipient address rejected`), so any embedded email is
// masked with the redactEmail pattern; the error name + driver code are kept
// for diagnosability. Mirrors the dlqErrorDetail convention (code + name).
// Extracted from email-queue.service.ts (Rule 4 file-size split).

/** Masks an email address for logs: "alice@example.com" → "a***@example.com". */
export function redactEmail(address: string): string {
  const [local, domain] = address.split('@');
  if (!local || !domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

const EMAIL_ADDRESS_RE =
  /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+/g;

/**
 * Bounded, PII-safe error detail for the `last_error` column. The persistence
 * boundary (EmailQueueService.settle) and callers both route error detail
 * through here, so no code path can write raw PII.
 */
export function sanitizeEmailError(error: unknown): string {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const code = (error as { code?: unknown })?.code;
  const codeStr = typeof code === 'string' && code.length > 0 ? code : name;
  const message = error instanceof Error ? error.message : String(error);
  const masked = message.replace(EMAIL_ADDRESS_RE, (address) => redactEmail(address));
  return `${codeStr}:${masked}`.slice(0, 512);
}
