// dlq-entry-card.tsx
// Individual DLQ entry with event details, retry/dismiss actions.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Badge, Button } from '@plexica/ui';

import type { DeadLetterEntry } from '../../types/plugin.js';

interface DlqEntryCardProps {
  entry: DeadLetterEntry;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  isRetrying: boolean;
  isDismissing: boolean;
}

// Sensitive field patterns that should be redacted in DLQ payload display
const SENSITIVE_FIELDS = ['email', 'password', 'token', 'secret', 'authorization', 'apiKey', 'ssn'];

/**
 * Redacts sensitive fields from a payload object recursively.
 * Truncates payloads over 1000 chars to avoid rendering bloat.
 */
function redactPayload(payload: Record<string, unknown>): string {
  const redacted = structuredClone(payload);

  function walk(obj: Record<string, unknown>): void {
    for (const key of Object.keys(obj)) {
      if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        walk(obj[key] as Record<string, unknown>);
      }
    }
  }

  walk(redacted);
  const json = JSON.stringify(redacted, null, 2);
  return json.length > 1000 ? json.slice(0, 1000) + '\n… (truncated)' : json;
}

export function DlqEntryCard({
  entry,
  onRetry,
  onDismiss,
  isRetrying,
  isDismissing,
}: DlqEntryCardProps): JSX.Element {
  const intl = useIntl();
  const [isExpanded, setIsExpanded] = useState(false);

  const statusVariant =
    entry.status === 'pending'
      ? 'pending'
      : entry.status === 'retried'
        ? 'success'
        : 'default';

  const statusLabelId =
    entry.status === 'pending'
      ? 'admin.dlq.status.pending'
      : entry.status === 'retried'
        ? 'admin.dlq.status.retried'
        : 'admin.dlq.status.dismissed';

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      {/* Summary row */}
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-50"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-neutral-900">{entry.eventType}</span>
          <span className="text-xs text-neutral-500">{entry.pluginName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant} label={intl.formatMessage({ id: statusLabelId })} />
          <span className="text-xs text-neutral-400">
            {intl.formatDate(entry.failedAt, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-neutral-100 px-4 py-3">
          <div className="mb-3 space-y-2 text-sm">
            <p>
              <span className="font-medium text-neutral-700">
                <FormattedMessage id="admin.dlq.retryCount" />:
              </span>{' '}
              <span className="text-neutral-600">{entry.retryCount}</span>
            </p>
            {entry.errorMessage && (
              <div>
                <span className="font-medium text-neutral-700">
                  <FormattedMessage id="admin.dlq.error" />:
                </span>
                <pre className="mt-1 rounded bg-neutral-50 p-2 text-xs text-neutral-600">
                  {entry.errorMessage}
                </pre>
              </div>
            )}
            <div>
              <span className="font-medium text-neutral-700">
                <FormattedMessage id="admin.dlq.payload" />:
              </span>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-xs text-neutral-600">
                {redactPayload(entry.payload)}
              </pre>
            </div>
          </div>

          {entry.status === 'pending' && (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onDismiss(entry.id)}
                disabled={isDismissing}
                loading={isDismissing}
              >
                <FormattedMessage id="admin.dlq.dismiss" />
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => onRetry(entry.id)}
                disabled={isRetrying}
                loading={isRetrying}
              >
                <FormattedMessage id="admin.dlq.retry" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
