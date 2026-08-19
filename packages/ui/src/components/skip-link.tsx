// skip-link.tsx
// Accessible skip navigation link — visible on keyboard focus.
// Must be the first focusable element in the DOM.
//
// Extracted from apps/web to @plexica/ui (Decision 7, 2026-08-18).
//
// NOTE: intentionally uses <a href="#..."> (not a router Link component).
//   AGENTS.md forbids <a href> in place of router components for page navigation,
//   but this is an intra-page anchor jump (#main-content), not a route change.
//   Using a native <a> is correct here; router navigation would be semantically wrong.

import { useIntl } from 'react-intl';

/**
 * Skip link — jumps focus to `#main-content`.
 * The `skipToContentLabelId` prop lets each app use its own i18n key.
 * Defaults to `'nav.skipToContent'` (the key used by apps/web).
 */
export function SkipLink({
  skipToContentLabelId = 'nav.skipToContent',
}: {
  skipToContentLabelId?: string;
}): JSX.Element {
  const intl = useIntl();

  return (
    <a
      href="#main-content"
      className={
        'sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 ' +
        'focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-sm ' +
        'focus:font-medium focus:text-neutral-900 focus:shadow-md focus:outline-none ' +
        'focus:ring-2 focus:ring-primary-500'
      }
    >
      {intl.formatMessage({ id: skipToContentLabelId })}
    </a>
  );
}
