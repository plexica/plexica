// skip-link.tsx
// Accessible skip navigation link — visible on keyboard focus.
// Must be the first focusable element in the DOM.
// L-4 fix: text is now sourced from react-intl (was hardcoded English string).
// L-02 note: intentionally uses <a href="#..."> (not a router Link component).
//   AGENTS.md forbids <a href> in place of router components for page navigation,
//   but this is an intra-page anchor jump (#main-content), not a route change.
//   Using a native <a> is correct here; router navigation would be semantically wrong.

import { useIntl } from 'react-intl';

export function SkipLink(): JSX.Element {
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
      {intl.formatMessage({ id: 'nav.skipToContent' })}
    </a>
  );
}
