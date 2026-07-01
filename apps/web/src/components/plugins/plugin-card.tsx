// plugin-card.tsx
// Marketplace plugin card with icon, name, description, categories, rating, and action button.

import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@plexica/ui';

import { RatingStars } from './rating-stars.js';
import { CATEGORY_LABEL_MAP } from './plugin-categories.js';

import type { PluginCatalogEntry } from '../../types/plugin.js';

interface PluginCardProps {
  plugin: PluginCatalogEntry;
  isInstalling: boolean;
  canManage?: boolean;
  onInstall: (slug: string) => void;
  onShowDetail: (slug: string) => void;
}

export function PluginCard({
  plugin,
  isInstalling,
  canManage = true,
  onInstall,
  onShowDetail,
}: PluginCardProps): JSX.Element {
  const intl = useIntl();

  function handleInstallClick(e: React.MouseEvent): void {
    e.stopPropagation();
    onInstall(plugin.slug);
  }

  function handleCardKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onShowDetail(plugin.slug);
    }
  }

  return (
    <div
      className="group cursor-pointer rounded-lg border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      onClick={() => onShowDetail(plugin.slug)}
      onKeyDown={handleCardKeyDown}
      tabIndex={0}
      role="group"
      aria-label={`${plugin.name} — ${plugin.description}`}
      data-testid="plugin-card"
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

      <div className="mt-2 flex items-center gap-2">
        <RatingStars rating={plugin.rating as number} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {plugin.categories.map((cat) => (
          <span
            key={cat}
            className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
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
          disabled={plugin.isInstalled || isInstalling || !canManage}
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
