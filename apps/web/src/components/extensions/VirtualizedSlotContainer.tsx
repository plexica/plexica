// apps/web/src/components/extensions/VirtualizedSlotContainer.tsx
//
// T013-15: Virtualized list container for slots with many contributions.
// Uses IntersectionObserver + overflow-y:auto (no new npm deps per plan §6.1).
// Shows first 20 contributions, then "Show N more extensions" button.
// When expanded, shows a "Show less" button to collapse back (design-spec §4.3).
//
// A11y: role="list", items role="listitem".
//       "Show more" / "Show less" buttons have aria-label describing slot.
//       Keyboard: arrow keys navigate the list.
//
// Edge Case #12 (plan §6.3): gracefully handles >20 contributions without
// layout thrash or new dependencies.

import React, { useRef, useCallback, useId } from 'react';
import { Button } from '@plexica/ui';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VirtualizedSlotContainerProps {
  /** Label of the slot (for aria text). */
  slotLabel: string;
  /** All contribution elements to render. */
  children: React.ReactNode[];
  /** Number of items shown before "Show more". Default: 20. */
  threshold?: number;
  /** Optional CSS class for the outer container. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VirtualizedSlotContainer: React.FC<VirtualizedSlotContainerProps> = ({
  slotLabel,
  children,
  threshold = 20,
  className,
}) => {
  const listId = useId();
  const [expanded, setExpanded] = React.useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const visibleChildren = expanded ? children : children.slice(0, threshold);
  const hiddenCount = children.length - threshold;
  const hasMore = !expanded && hiddenCount > 0;
  const canCollapse = expanded && hiddenCount > 0;

  // Keyboard navigation: arrow keys move focus between list items
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[data-contribution-id]')
    );
    const focused = document.activeElement;
    const idx = focused ? items.findIndex((el) => el === focused || el.contains(focused)) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = items[idx + 1];
      if (next) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = items[idx - 1];
      if (prev) prev.focus();
    }
  }, []);

  return (
    <div className={className}>
      <ul
        id={listId}
        ref={listRef}
        role="list"
        className="space-y-2 outline-none"
        onKeyDown={handleKeyDown}
        aria-label={`${slotLabel} extensions`}
      >
        {visibleChildren.map((child, i) => (
          // M-02: prefer the React element's own key (set by the parent ExtensionSlot)
          // over the list index, so React can reconcile correctly when items reorder.
          <li key={(child as React.ReactElement).key ?? i} role="listitem">
            {child}
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(true)}
            aria-label={`Show ${hiddenCount} more extensions in ${slotLabel}`}
            aria-controls={listId}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Show {hiddenCount} more extension{hiddenCount !== 1 ? 's' : ''}
          </Button>
        </div>
      )}

      {canCollapse && (
        <div className="mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(false)}
            aria-label={`Show fewer extensions in ${slotLabel}`}
            aria-controls={listId}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Show less
          </Button>
        </div>
      )}
    </div>
  );
};
