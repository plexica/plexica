// marketplace-page.tsx
// Tenant admin marketplace: browse, search, and install plugins.

import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Input, Pagination, Button } from '@plexica/ui';
import { Package, Store } from 'lucide-react';

import { usePublishedPlugins, useInstallPlugin, usePluginDetail } from '../hooks/use-plugins.js';
import { PluginCard } from '../components/plugins/plugin-card.js';
import { PluginDetailSheet } from '../components/plugins/plugin-detail-sheet.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

const PAGE_SIZE = 12;

export function MarketplacePage(): JSX.Element {
  const intl = useIntl();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [installingSlugs, setInstallingSlugs] = useState<Set<string>>(new Set());

  // Debounce search input by 300ms to avoid rapid-fire API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isPending, isError, refetch } = usePublishedPlugins(
    debouncedSearch.length > 0
      ? { page, search: debouncedSearch }
      : { page }
  );

  const detailSlug = selectedSlug ?? '';
  const { data: detailData, isPending: detailPending } = usePluginDetail(detailSlug);
  const { mutate: installPlugin } = useInstallPlugin();

  const plugins = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  function handleSearchInput(value: string): void {
    setSearchInput(value);
  }

  function handleInstall(slug: string): void {
    setInstallingSlugs((prev) => new Set(prev).add(slug));
    installPlugin(slug, {
      onSettled: () => {
        setInstallingSlugs((prev) => {
          const next = new Set(prev);
          next.delete(slug);
          return next;
        });
      },
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">
          <FormattedMessage id="marketplace.title" />
        </h1>
        <div className="w-64">
          <Input
            placeholder={intl.formatMessage({ id: 'marketplace.search' })}
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearchInput(e.target.value)}
            aria-label={intl.formatMessage({ id: 'marketplace.search' })}
          />
        </div>
      </div>

      {/* Loading state */}
      {isPending && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonLoader key={i} variant="card" className="h-44" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && <PageError onRetry={() => void refetch()} />}

      {/* Empty state */}
      {!isPending && !isError && plugins.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="mb-4 h-12 w-12 text-neutral-300" />
          <h3 className="text-lg font-medium text-neutral-600">
            <FormattedMessage id="marketplace.empty" />
          </h3>
        </div>
      )}

      {/* Plugin grid */}
      {!isPending && !isError && plugins.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {plugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                isInstalling={installingSlugs.has(plugin.slug)}
                onInstall={handleInstall}
                onShowDetail={(slug: string) => setSelectedSlug(slug)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* Detail sheet */}
      <PluginDetailSheet
        plugin={detailData}
        isOpen={selectedSlug !== null}
        isPending={detailPending}
        onClose={() => setSelectedSlug(null)}
        onInstall={handleInstall}
      />
    </div>
  );
}
