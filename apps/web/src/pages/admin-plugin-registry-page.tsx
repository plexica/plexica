// admin-plugin-registry-page.tsx
// Super admin: manage the global plugin catalog — register, publish, unpublish plugins.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Badge, Button, Input } from '@plexica/ui';
import { Package } from 'lucide-react';

import { usePluginRegistry, usePublishPlugin, useUnpublishPlugin } from '../hooks/use-plugins.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

import type { PluginCatalogEntry } from '../types/plugin.js';

export function AdminPluginRegistryPage(): JSX.Element {
  const intl = useIntl();
  const [search, setSearch] = useState('');

  const { data, isPending, isError, refetch } = usePluginRegistry(
    search.length > 0
      ? { search }
      : undefined
  );

  const { mutate: publish, isPending: isPublishing } = usePublishPlugin();
  const { mutate: unpublish, isPending: isUnpublishing } = useUnpublishPlugin();

  const plugins: PluginCatalogEntry[] = data?.data ?? [];

  function handlePublishToggle(plugin: PluginCatalogEntry): void {
    if (plugin.status === 'published') {
      unpublish(plugin.slug);
    } else {
      publish(plugin.slug);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">
          <FormattedMessage id="admin.plugins.registry" />
        </h1>
        <div className="flex items-center gap-3">
          <Input
            placeholder={intl.formatMessage({ id: 'marketplace.search' })}
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
          <Button variant="primary">
            <FormattedMessage id="admin.plugins.register" />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isPending && (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonLoader key={i} variant="card" className="h-16" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && <PageError onRetry={() => void refetch()} />}

      {/* Empty */}
      {!isPending && !isError && plugins.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="mb-4 h-12 w-12 text-neutral-300" />
          <h3 className="text-lg font-medium text-neutral-600">
            <FormattedMessage id="marketplace.empty" />
          </h3>
        </div>
      )}

      {/* Plugin list */}
      {!isPending && !isError && plugins.length > 0 && (
        <div className="space-y-2">
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-sm text-primary-600">
                  {plugin.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900">{plugin.name}</span>
                    <span className="text-xs text-neutral-400">v{plugin.version}</span>
                    <Badge
                      variant={
                        plugin.status === 'published'
                          ? 'success'
                          : plugin.status === 'draft'
                            ? 'pending'
                            : 'default'
                      }
                      label={
                        plugin.status === 'published'
                          ? intl.formatMessage({ id: 'admin.plugins.status.published' })
                          : plugin.status === 'draft'
                            ? intl.formatMessage({ id: 'admin.plugins.status.draft' })
                            : intl.formatMessage({ id: 'admin.plugins.status.unpublished' })
                      }
                    />
                  </div>
                  <p className="text-xs text-neutral-500">{plugin.author}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">
                  {plugin.installCount} installs
                </span>
                <Button
                  size="sm"
                  variant={plugin.status === 'published' ? 'secondary' : 'primary'}
                  onClick={() => handlePublishToggle(plugin)}
                  disabled={isPublishing || isUnpublishing}
                >
                  <FormattedMessage
                    id={
                      plugin.status === 'published'
                        ? 'admin.plugins.unpublish'
                        : 'admin.plugins.publish'
                    }
                  />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
