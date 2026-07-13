// placeholder-page.tsx
// Generic placeholder for scaffold routes. Replaced per feature in subsequent
// sprint cards. Keeps all UI strings in react-intl (Rule 3).

import { FormattedMessage } from 'react-intl';

interface PlaceholderPageProps {
  titleId: string;
}

export function PlaceholderPage({ titleId }: PlaceholderPageProps): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center">
      <h1 className="text-lg font-bold text-neutral-900">
        <FormattedMessage id={titleId} />
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        <FormattedMessage id="admin.page.placeholder" />
      </p>
    </div>
  );
}
