// marketplace-page.tsx
// Tenant admin marketplace: browse, search, filter by category, and install plugins.

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Input, Pagination, Button } from '@plexica/ui';
import { Package, SearchX } from 'lucide-react';

import { usePublishedPlugins, useInstallPlugin, usePluginDetail } from '../hooks/use-plugins.js';
import { useAbac } from '../hooks/use-abac.js';
import { PluginCard } from '../components/plugins/plugin-card.js';
import { PluginDetailSheet } from '../components/plugins/plugin-detail-sheet.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

const PAGE_SIZE = 12;

const CATEGORIES = [
  { id: '', label: 'marketplace.categories.all' },
  { id: 'sales', label: 'marketplace.categories.sales' },
  { id: 'productivity', label: 'marketplace.categories.productivity' },
  { id: 'analytics', label: 'marketplace.categories.analytics' },
  { id: 'dev-tools', label: 'marketplace.categories.devTools' },
  { id: 'communication', label: 'marketplace.categories.communication' },
  { id: 'automation', label: 'marketplace.categories.automation' },
];

export function MarketplacePage(): JSX.Element {
  const intl = useIntl();
  const canManage = useAbac();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [installingSlugs, setInstallingSlugs] = useState<Set<string>>(new Set());
  const [installError, setInstallError] = useState<string | null>(null);

  // Debounce search input by 300ms to avoid rapid-fire API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
      setSelectedSlug(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { page, pageSize: PAGE_SIZE };
    if (debouncedSearch.length > 0) params.search = debouncedSearch;
    if (selectedCategory.length > 0) params.category = selectedCategory;
    return params;
  }, [page, debouncedSearch, selectedCategory]);

  const { data, isPending, isError, refetch } = usePublishedPlugins(queryParams);

  const detailSlug = selectedSlug ?? '';
  const { data: detailData, isPending: detailPending, isError: detailIsError, refetch: detailRefetch } = usePluginDetail(detailSlug);
  const { mutate: installPlugin } = useInstallPlugin();

  const plugins = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const handleSearchInput = useCallback((value: string): void => { setSearchInput(value); }, []);
  const handleCategoryChange = useCallback((category: string): void => {
    setSelectedCategory((prev) => (prev === category ? '' : category));
    setPage(1);
    setSelectedSlug(null);
  }, []);
  const handleCloseDetail = useCallback((): void => { setSelectedSlug(null); }, []);
  const handleRetryDetail = useCallback((): void => { void detailRefetch(); }, [detailRefetch]);

  function handleInstall(slug: string): void {
    setInstallingSlugs((prev) => new Set(prev).add(slug));
    setInstallError(null);
    installPlugin(slug, {
      onSettled: () => {
        setInstallingSlugs((prev) => {
          const next = new Set(prev);
          next.delete(slug);
          return next;
        });
      },
      onError: () => {
        setInstallError(slug);
      },
    });
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header with title and search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">
          <FormattedMessage id="marketplace.title" />
        </h1>
        <div className="w-full sm:w-72">
          <label htmlFor="marketplace-search" className="sr-only">
            <FormattedMessage id="marketplace.search" />
          </label>
          <Input
            id="marketplace-search"
            placeholder={intl.formatMessage({ id: 'marketplace.search' })}
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearchInput(e.target.value)}
            aria-label={intl.formatMessage({ id: 'marketplace.search' })}
          />
        </div>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={intl.formatMessage({ id: 'marketplace.categoryFilter' })}>
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                isActive
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-800'
              }`}
              aria-pressed={isActive}
            >
              <FormattedMessage id={cat.label} />
            </button>
          );
        })}
      </div>

      {/* Live region for loading — always in DOM */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isPending ? <FormattedMessage id="marketplace.loading" /> : ''}
      </div>
      {/* Install error */}
      {installError !== null && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <FormattedMessage id="marketplace.installFailed" />
        </div>
      )}
      {/* Loading */}
      {isPending && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonLoader key={i} variant="card" className="h-44" />
          ))}
        </div>
      )}
      {/* Error */}
      {isError && <PageError onRetry={() => void refetch()} />}
      {/* Empty */}
      {!isPending && !isError && plugins.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {debouncedSearch.length > 0 ? (
            <SearchX className="mb-4 h-12 w-12 text-neutral-300" />
          ) : (
            <Package className="mb-4 h-12 w-12 text-neutral-300" />
          )}
          <h3 className="text-lg font-medium text-neutral-600">
            <FormattedMessage id="marketplace.empty" />
          </h3>
          <p className="mt-1 text-sm text-neutral-400">
            <FormattedMessage id="marketplace.emptyHint" />
          </p>
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
                canManage={canManage}
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
      <PluginDetailSheet plugin={detailData} isOpen={selectedSlug !== null} isPending={detailPending} isError={detailIsError} onClose={handleCloseDetail} onInstall={handleInstall} onRetry={handleRetryDetail} />
    </div>);}
