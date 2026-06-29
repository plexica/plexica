// plugin-card.tsx
// Marketplace plugin card with icon, name, description, categories, and action button.

import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@plexica/ui';

import type { PluginCatalogEntry } from '../../types/plugin.js';

interface PluginCardProps {
  plugin: PluginCatalogEntry;
  isInstalling: boolean;
  onInstall: (slug: string) => void;
  onShowDetail: (slug: string) => void;
}

const CATEGORY_LABEL_MAP: Record<string, string> = {
  sales: 'marketplace.categories.sales',
  productivity: 'marketplace.categories.productivity',
  analytics: 'marketplace.categories.analytics',
  'dev-tools': 'marketplace.categories.devTools',
  e2e: 'marketplace.categories.all',
  testing: 'marketplace.categories.all',
};

export function PluginCard({
  plugin,
  isInstalling,
  onInstall,
  onShowDetail,
}: PluginCardProps): JSX.Element {
  const intl = useIntl();

  function handleInstallClick(e: React.MouseEvent): void {
    e.stopPropagation();
    onInstall(plugin.slug);
  }

  return (
    <div
      className="group cursor-pointer rounded-lg border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md"
      onClick={() => onShowDetail(plugin.slug)}
      data-testid="plugin-card"
      role="article"
      aria-label={`${plugin.name} — ${plugin.description}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-lg text-primary-600">
            <span className="text-sm font-bold">{plugin.name.charAt(0)}</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">{plugin.name}</h3>
            <p className="text-xs text-neutral-500">{plugin.author}</p>
          </div>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-neutral-600">{plugin.description}</p>

      <div className="mt-3 flex flex-wrap gap-1">
        {plugin.categories.map((cat) => (
          <span
            key={cat}
            className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500"
          >
            <FormattedMessage id={CATEGORY_LABEL_MAP[cat] ?? cat} defaultMessage={cat} />
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
        <span className="text-xs text-neutral-400">
          <FormattedMessage id="marketplace.installCount" values={{ count: plugin.installCount }} />
        </span>
        <Button
          size="sm"
          variant={plugin.isInstalled ? 'secondary' : 'primary'}
          disabled={plugin.isInstalled || isInstalling}
          onClick={handleInstallClick}
          aria-label={
            plugin.isInstalled
              ? intl.formatMessage({ id: 'marketplace.installed' })
              : isInstalling
                ? intl.formatMessage({ id: 'marketplace.installing' })
                : intl.formatMessage({ id: 'marketplace.install' })
          }
        >
          {plugin.isInstalled ? (
            <FormattedMessage id="marketplace.installed" />
          ) : isInstalling ? (
            <FormattedMessage id="marketplace.installing" />
          ) : (
            <FormattedMessage id="marketplace.install" />
          )}
        </Button>
      </div>
    </div>
  );
}
