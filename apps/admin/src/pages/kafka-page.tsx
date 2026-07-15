// kafka-page.tsx — Kafka status dashboard (S5-903, FR 005-11).
// Polls /admin/kafka/status every 15s via TanStack Query (useKafkaStatus hook).
// Shows consumer lag table + DLQ depth summary. Warning indicators when
// lag > 1000 or DLQ > 100. Loading skeleton, error, empty states.
// All UI strings via react-intl; icons from Lucide.

import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

import {
  ConsumerLagTable,
  KafkaSkeleton,
  LAG_WARNING_THRESHOLD,
  computeTotalLag,
} from '../components/kafka/consumer-lag-table.js';
import { useKafkaStatus } from '../hooks/use-kafka-status.js';

const DLQ_WARNING_THRESHOLD = 100;

export function KafkaPage(): JSX.Element {
  const { data, isLoading, isError, error, refetch, isFetching } = useKafkaStatus();
  const intl = useIntl();

  const totalLag = data ? computeTotalLag(data.consumerLags) : 0;
  const hasConsumers = (data?.consumerLags.length ?? 0) > 0;
  const dlqWarning = (data?.dlqDepth ?? 0) > DLQ_WARNING_THRESHOLD;
  const lagWarnings = data
    ? data.consumerLags.filter((r) => r.lag > LAG_WARNING_THRESHOLD).length
    : 0;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">
          <FormattedMessage id="admin.kafka.title" />
        </h1>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          aria-label={intl.formatMessage({ id: 'admin.kafka.retry' })}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          <FormattedMessage id="admin.kafka.retry" />
        </button>
      </div>

      {isLoading && (
        <div aria-label={intl.formatMessage({ id: 'admin.kafka.loading' })}>
          <KafkaSkeleton />
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-medium">
            <FormattedMessage id="admin.kafka.error" />
          </p>
          {error instanceof Error && <p className="mt-1 text-red-700">{error.message}</p>}
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            <FormattedMessage id="admin.kafka.retry" />
          </button>
        </div>
      )}

      {!isLoading && !isError && data && (
        <div className="space-y-6">
          {!hasConsumers ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center">
              <p className="text-sm text-neutral-500">
                <FormattedMessage id="admin.kafka.empty" />
              </p>
            </div>
          ) : (
            <>
              <div
                className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
                aria-live="polite"
              >
                <p className="text-sm font-medium text-neutral-900">
                  <FormattedMessage id="admin.kafka.totalLag" values={{ count: totalLag }} />
                </p>
                {lagWarnings > 0 && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-warning-dark">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <FormattedMessage id="admin.kafka.warnings.highLag" values={{ count: lagWarnings }} />
                  </p>
                )}
              </div>

              <div>
                <h2 className="mb-2 text-sm font-semibold text-neutral-700">
                  <FormattedMessage id="admin.kafka.consumerLag" />
                </h2>
                <ConsumerLagTable lags={data.consumerLags} />
              </div>
            </>
          )}

          <div>
            <h2 className="mb-2 text-sm font-semibold text-neutral-700">
              <FormattedMessage id="admin.kafka.dlqDepth" />
            </h2>
            <div
              className={`flex items-center gap-2 rounded-lg border p-4 shadow-sm ${
                dlqWarning ? 'border-warning-light bg-warning-light/30' : 'border-neutral-200 bg-white'
              }`}
              role={dlqWarning ? 'alert' : undefined}
            >
              {dlqWarning ? (
                <AlertTriangle className="h-5 w-5 text-warning-dark" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-success-dark" aria-hidden="true" />
              )}
              <p
                className={`text-sm font-medium ${dlqWarning ? 'text-warning-dark' : 'text-neutral-900'}`}
              >
                <FormattedMessage id="admin.kafka.totalDlq" values={{ count: data.dlqDepth }} />
              </p>
              {dlqWarning && (
                <p className="ml-auto text-xs text-warning-dark">
                  <FormattedMessage id="admin.kafka.warnings.highDlq" />
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
