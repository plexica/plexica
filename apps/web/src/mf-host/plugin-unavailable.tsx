// plugin-unavailable.tsx
// Fallback UI shown when a plugin slot crashes or is unavailable.

import { useIntl, FormattedMessage } from 'react-intl';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import type { RefObject } from 'react';

interface PluginUnavailableProps {
  pluginSlug: string;
  isPermanentlyDegraded?: boolean;
  onRetry?: () => void;
  retryButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function PluginUnavailable({
  pluginSlug,
  isPermanentlyDegraded = false,
  onRetry,
  retryButtonRef,
}: PluginUnavailableProps): JSX.Element {
  const intl = useIntl();

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950"
      role="alert"
      aria-label={intl.formatMessage(
        { id: 'plugin.unavailable' },
        { slug: pluginSlug }
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />

      <div className="flex-1">
        {isPermanentlyDegraded ? (
          <p className="text-amber-700 dark:text-amber-300">
            <FormattedMessage id="plugin.degraded" values={{ slug: pluginSlug }} />
          </p>
        ) : (
          <p className="text-amber-700 dark:text-amber-300">
            <FormattedMessage id="plugin.crashed" values={{ slug: pluginSlug }} />
          </p>
        )}
      </div>

      {!isPermanentlyDegraded && onRetry && (
        <button
          ref={retryButtonRef}
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
          aria-label={intl.formatMessage({ id: 'plugin.retry' }, { slug: pluginSlug })}
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          <FormattedMessage id="plugin.retry" />
        </button>
      )}
    </div>
  );
}
