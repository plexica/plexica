// breadcrumb.tsx
// Navigation breadcrumb using TanStack Router useMatches().
// Shows home icon + route titles with proper accessibility.

import { useMatches, Link } from '@tanstack/react-router';
import { Home } from 'lucide-react';
import { useIntl } from 'react-intl';

interface RouteMeta {
  title?: string;
}

export function Breadcrumb(): JSX.Element {
  const intl = useIntl();
  const matches = useMatches();

  // Filter to routes that have a title in their meta
  const breadcrumbs = matches
    .filter((match) => {
      const meta = match.context as RouteMeta | undefined;
      return typeof meta?.title === 'string';
    })
    .map((match) => ({
      pathname: match.pathname,
      title: (match.context as RouteMeta).title ?? '',
    }));

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm">
        <li>
          <Link
            to="/"
            aria-label={intl.formatMessage({ id: 'nav.dashboard' })}
            className="text-neutral-500 hover:text-neutral-900"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
          </Link>
        </li>

        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <li key={crumb.pathname} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-neutral-300">
                /
              </span>
              {isLast ? (
                <span aria-current="page" className="font-medium text-neutral-900">
                  {crumb.title}
                </span>
              ) : (
                <Link to={crumb.pathname} className="text-neutral-500 hover:text-neutral-900">
                  {crumb.title}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
