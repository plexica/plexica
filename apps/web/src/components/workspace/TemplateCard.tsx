// apps/web/src/components/workspace/TemplateCard.tsx
//
// T011-22: TemplateCard — displays a single workspace template for selection.
// Spec 011 Phase 4 (FR-021, FR-022).
// WCAG 2.1 AA: role="radio", aria-checked, keyboard selectable.
//
// Fixes applied:
//   F-022: forwardRef added so TemplatePickerGrid can imperatively focus cards
//          for WAI-ARIA radiogroup arrow-key navigation.
//          tabIndex prop wired through (controlled by parent grid).

import { forwardRef } from 'react';
import { Check, Puzzle, FileText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@plexica/ui';

export interface TemplateItemSummary {
  type: 'plugin' | 'page' | 'setting';
}

export interface TemplateCardData {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  /** Plugin that registered this template, null for system templates */
  sourcePluginName: string | null;
  items: TemplateItemSummary[];
}

export interface TemplateCardProps {
  template: TemplateCardData;
  selected?: boolean;
  onSelect?: (templateId: string) => void;
  /**
   * Roving tabindex value — provided by TemplatePickerGrid to implement
   * WAI-ARIA radiogroup arrow-key navigation (F-022).
   * Defaults to 0 (standalone usage).
   */
  tabIndex?: number;
}

function itemCounts(items: TemplateItemSummary[]) {
  return {
    plugins: items.filter((i) => i.type === 'plugin').length,
    pages: items.filter((i) => i.type === 'page').length,
    settings: items.filter((i) => i.type === 'setting').length,
  };
}

export const TemplateCard = forwardRef<HTMLDivElement, TemplateCardProps>(function TemplateCard(
  { template, selected = false, onSelect, tabIndex = 0 },
  ref
) {
  const counts = itemCounts(template.items);

  const handleClick = () => onSelect?.(template.id);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(template.id);
    }
  };

  return (
    <div
      ref={ref}
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative flex flex-col gap-2 rounded-md border p-4 cursor-pointer outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1',
        selected
          ? 'border-[var(--template-card-selected-border)] bg-[var(--template-card-selected)]'
          : 'border-[var(--template-card-border)] bg-[var(--template-card-bg)] hover:bg-[var(--template-card-hover)]'
      )}
    >
      {/* Selected checkmark */}
      {selected && (
        <span
          className="absolute top-2 right-2 text-[var(--template-card-selected-border)]"
          aria-hidden="true"
        >
          <Check className="w-4 h-4" />
        </span>
      )}

      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="flex-1 font-semibold text-sm leading-tight">{template.name}</span>
        {template.isDefault && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 shrink-0"
            style={{
              background: 'var(--template-default-badge-bg)',
              color: 'var(--template-default-badge-fg)',
            }}
          >
            Default
          </Badge>
        )}
      </div>

      {/* Description */}
      {template.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
      )}

      {/* Source plugin */}
      {template.sourcePluginName && (
        <p className="text-xs text-muted-foreground">
          by <span className="font-medium">{template.sourcePluginName}</span>
        </p>
      )}

      {/* Item count breakdown */}
      {template.items.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {counts.plugins > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Puzzle className="w-3 h-3" aria-hidden="true" />
              {counts.plugins} {counts.plugins === 1 ? 'plugin' : 'plugins'}
            </span>
          )}
          {counts.pages > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <FileText className="w-3 h-3" aria-hidden="true" />
              {counts.pages} {counts.pages === 1 ? 'page' : 'pages'}
            </span>
          )}
          {counts.settings > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Settings className="w-3 h-3" aria-hidden="true" />
              {counts.settings} {counts.settings === 1 ? 'setting' : 'settings'}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
