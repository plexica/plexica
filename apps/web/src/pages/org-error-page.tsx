// org-error-page.tsx
// Shown when tenant resolution fails.
// Two variants: no-subdomain (which org?) or unknown (org not found).
// No valid tenant information is ever revealed.

import { useSearch } from '@tanstack/react-router';
import { FormattedMessage } from 'react-intl';

export function OrgErrorPage(): JSX.Element {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const reason = search['reason'] ?? 'unknown';
  const isNoSubdomain = reason === 'no-subdomain';

  const titleId = isNoSubdomain ? 'org.error.noSubdomain.title' : 'org.error.notFound.title';

  const descriptionId = isNoSubdomain
    ? 'org.error.noSubdomain.description'
    : 'org.error.notFound.description';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-neutral-900">
          <FormattedMessage id={titleId} />
        </h1>
        <p className="mt-2 text-neutral-600">
          <FormattedMessage id={descriptionId} />
        </p>
        {isNoSubdomain && (
          <p className="mt-2 text-sm text-neutral-500">
            <FormattedMessage id="org.error.addressExample" />
          </p>
        )}
        <p className="mt-6 text-sm text-neutral-500">
          <FormattedMessage id="org.error.contactAdmin" />
        </p>
      </div>
    </main>
  );
}
