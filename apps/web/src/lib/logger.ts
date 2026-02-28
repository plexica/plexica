// apps/web/src/lib/logger.ts
//
// Structured Pino logger for the web frontend.
// Uses browser-compatible config so logs go through console.* methods.
// Log level is configurable via VITE_LOG_LEVEL env var.
// Pretty-print in development, JSON-serialised in production.

import pino from 'pino';

const isDevelopment = import.meta.env.MODE === 'development';

export const logger = pino({
  level:
    (import.meta.env.VITE_LOG_LEVEL as string | undefined) ?? (isDevelopment ? 'debug' : 'info'),
  browser: {
    // Emit each log record as a plain JS object so structured fields are preserved
    asObject: true,
    serialize: true,
    // In development, transmit through console.log so devtools can pretty-print
    // the object. In production keep it silent (standard console.* binding).
    transmit: isDevelopment
      ? {
          send: (_level, logEvent) => {
            const { messages, bindings, ts, level } = logEvent;
            // eslint-disable-next-line no-console
            console.log(
              `[${level.label.toUpperCase()}]`,
              ...bindings.flatMap((b) => Object.entries(b).flat()),
              ...messages,
              { ts }
            );
          },
        }
      : undefined,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

/**
 * Build a child logger enriched with common request/session context.
 * Pass `{}` to get a plain child with no extra fields.
 */
export function createContextLogger(context: {
  pluginId?: string;
  tenantSlug?: string;
  userId?: string;
}) {
  return logger.child(context);
}
