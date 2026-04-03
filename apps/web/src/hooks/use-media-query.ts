// use-media-query.ts
// React hook that tracks whether a CSS media query matches.
// Uses window.matchMedia with event listener cleanup — SSR-safe (returns false
// on environments where window is undefined).

import { useEffect, useState } from 'react';

/**
 * Returns `true` when the given CSS media query matches the current viewport.
 * Re-renders whenever the match status changes.
 *
 * @param query - A valid CSS media query string, e.g. `'(min-width: 1024px)'`.
 *
 * @example
 * const isDesktop = useMediaQuery('(min-width: 1024px)');
 */
export function useMediaQuery(query: string): boolean {
  const getMatches = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent): void => {
      setMatches(e.matches);
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
