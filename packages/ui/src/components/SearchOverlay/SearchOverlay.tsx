// File: packages/ui/src/components/SearchOverlay/SearchOverlay.tsx
// T007-24 — Full-screen search overlay with keyboard navigation and debounce

import * as React from 'react';
import { Search, X, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SearchResultItem {
  id: string;
  title: string;
  type: string;
  snippet?: string;
}

export interface SearchOverlayProps {
  /** Called with the search term (debounced 300ms). */
  onSearch?: (query: string) => Promise<SearchResultItem[]> | SearchResultItem[];
  /** Called when user selects a result. */
  onSelect?: (item: SearchResultItem) => void;
  /** Called when the overlay is closed. */
  onClose?: () => void;
  /** Placeholder text for the search input. */
  placeholder?: string;
  /** Recently searched terms to show before the user types. */
  recentSearches?: string[];
  /** Whether the overlay is open. */
  open?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const SearchOverlay = React.forwardRef<HTMLDivElement, SearchOverlayProps>(
  (
    {
      onSearch,
      onSelect,
      onClose,
      placeholder = 'Search everywhere…',
      recentSearches = [],
      open = true,
      className,
    },
    ref
  ) => {
    const [query, setQuery] = React.useState('');
    const [results, setResults] = React.useState<SearchResultItem[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const listRef = React.useRef<HTMLUListElement>(null);

    const debouncedQuery = useDebounce(query, 300);

    // Focus input when opened
    React.useEffect(() => {
      if (open) {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }, [open]);

    // Run search when debounced query changes
    React.useEffect(() => {
      if (!debouncedQuery.trim() || !onSearch) {
        setResults([]);
        setActiveIndex(-1);
        return;
      }
      let cancelled = false;
      setIsLoading(true);
      Promise.resolve(onSearch(debouncedQuery))
        .then((items) => {
          if (!cancelled) {
            setResults(items);
            setActiveIndex(-1);
          }
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [debouncedQuery, onSearch]);

    // Global `/` key to open (handled by parent), Esc to close
    React.useEffect(() => {
      if (!open) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose?.();
        }
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);

    // Keyboard navigation inside the overlay
    const handleKeyDown = (e: React.KeyboardEvent) => {
      const total = results.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, total - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        const item = results[activeIndex];
        if (item) {
          onSelect?.(item);
          onClose?.();
        }
      }
    };

    const handleSelect = (item: SearchResultItem) => {
      onSelect?.(item);
      onClose?.();
    };

    const handleRecentSearch = (term: string) => {
      setQuery(term);
      inputRef.current?.focus();
    };

    if (!open) return null;

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Dialog */}
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Global search"
          className={cn(
            'fixed left-1/2 top-[10%] z-50 w-full max-w-xl -translate-x-1/2 rounded-xl border border-border bg-background shadow-2xl',
            'sm:top-[15%]',
            // Full screen on mobile
            'max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 max-sm:rounded-none max-sm:max-w-none max-sm:h-full',
            className
          )}
          onKeyDown={handleKeyDown}
        >
          {/* Search input row */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            {isLoading ? (
              <div
                className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0"
                aria-hidden="true"
              />
            ) : (
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              aria-label="Search query"
              aria-autocomplete="list"
              aria-controls="search-results-list"
              autoComplete="off"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1 rounded hover:bg-muted transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-muted-foreground border border-border hover:bg-muted transition-colors"
              aria-label="Close search"
            >
              Esc
            </button>
          </div>

          {/* Results / recents */}
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {/* Recent searches (shown when no query) */}
            {!query && recentSearches.length > 0 && (
              <div>
                <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Recent Searches
                </p>
                <ul role="list">
                  {recentSearches.map((term) => (
                    <li key={term}>
                      <button
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                        onClick={() => handleRecentSearch(term)}
                      >
                        <Clock
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="flex-1 text-left">{term}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Search results */}
            {query && results.length > 0 && (
              <ul id="search-results-list" role="listbox" ref={listRef} aria-label="Search results">
                {results.map((item, idx) => (
                  <li key={item.id} role="option" aria-selected={activeIndex === idx}>
                    <button
                      className={cn(
                        'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
                        activeIndex === idx
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      )}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.title}</p>
                        {item.snippet && (
                          <p
                            className={cn(
                              'text-xs truncate',
                              activeIndex === idx
                                ? 'text-primary-foreground/70'
                                : 'text-muted-foreground'
                            )}
                          >
                            {item.snippet}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-xs',
                          activeIndex === idx
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {item.type}
                      </span>
                      <ArrowRight
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 self-center',
                          activeIndex === idx
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground/50'
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* No results */}
            {query && !isLoading && results.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </div>
            )}

            {/* Empty (no query, no recents) */}
            {!query && recentSearches.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Start typing to search&hellip;
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t border-border px-4 py-2 flex gap-4 text-xs text-muted-foreground">
            <span>
              <kbd className="font-mono">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="font-mono">↵</kbd> select
            </span>
            <span>
              <kbd className="font-mono">Esc</kbd> close
            </span>
          </div>
        </div>
      </>
    );
  }
);
SearchOverlay.displayName = 'SearchOverlay';

export { SearchOverlay };
