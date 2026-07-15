// plugins-page.tsx — Plugin catalog page with review actions (S5-803, FR 005-08).
// Data via TanStack Query only. All UI strings via react-intl.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Loader2, RefreshCw } from 'lucide-react';

import { Select } from '@plexica/ui';

import { PluginReviewDialog } from '../components/plugins/plugin-review-dialog.js';
import { PluginTable, PluginTableSkeleton } from '../components/plugins/plugin-table.js';
import { usePluginList, useReviewPlugin } from '../hooks/use-plugins.js';
import type { Plugin, ReviewStatus } from '../types/admin-types.js';

const REVIEW_FILTERS = [
  { value: 'all', labelKey: 'plugins.filter.all' },
  { value: 'pending', labelKey: 'plugins.review.pending' },
  { value: 'approved', labelKey: 'plugins.review.approved' },
  { value: 'rejected', labelKey: 'plugins.review.rejected' },
  { value: 'none', labelKey: 'plugins.review.none' },
] as const;

export function PluginsPage(): JSX.Element {
  const intl = useIntl();
  const [reviewFilter, setReviewFilter] = useState('all');
  const [reviewingPlugin, setReviewingPlugin] = useState<Plugin | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, isFetching, isError, refetch } = usePluginList();
  const reviewMutation = useReviewPlugin();

  const allPlugins = data ?? [];
  const filteredPlugins =
    reviewFilter === 'all'
      ? allPlugins
      : allPlugins.filter((p) => p.reviewStatus === (reviewFilter as ReviewStatus));

  const filterOptions = REVIEW_FILTERS.map((o) => ({
    value: o.value,
    label: intl.formatMessage({ id: o.labelKey }),
  }));

  function openReview(plugin: Plugin): void {
    setReviewingPlugin(plugin);
    setDialogOpen(true);
  }

  function handleReviewSubmit(decision: 'approve' | 'reject', notes: string): void {
    if (reviewingPlugin === null) return;
    reviewMutation.mutate(
      { slug: reviewingPlugin.slug, decision, notes },
      { onSuccess: () => { setDialogOpen(false); } }
    );
  }

  const emptyId = reviewFilter === 'all' ? 'plugins.empty' : 'plugins.empty.filtered';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-neutral-900">
        <FormattedMessage id="plugins.title" />
      </h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Select
            options={filterOptions}
            value={reviewFilter}
            onValueChange={setReviewFilter}
            aria-label={intl.formatMessage({ id: 'plugins.filter.review' })}
          />
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-300 px-3 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="plugins.refresh" />
        </button>
      </div>

      {isFetching && !isLoading && (
        <span className="self-end text-xs text-neutral-400" aria-live="polite">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden="true" />
          <FormattedMessage id="plugins.loading" />
        </span>
      )}

      {isError ? (
        <div
          role="alert"
          className="rounded-md border border-error-light bg-error-light/20 p-4 text-sm text-error-dark"
        >
          <FormattedMessage id="plugins.error" />
        </div>
      ) : isLoading ? (
        <PluginTableSkeleton />
      ) : filteredPlugins.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
          <FormattedMessage id={emptyId} />
        </div>
      ) : (
        <PluginTable plugins={filteredPlugins} onReview={openReview} />
      )}

      <p className="text-sm text-neutral-600" aria-live="polite">
        <FormattedMessage id="plugins.resultCount" values={{ count: filteredPlugins.length }} />
      </p>

      <PluginReviewDialog
        plugin={reviewingPlugin}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleReviewSubmit}
        loading={reviewMutation.isPending}
      />
    </div>
  );
}
