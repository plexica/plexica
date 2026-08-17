// page-error.tsx
// Implementation moved to @plexica/ui as ErrorState. This shim injects the
// app's react-intl messages so @plexica/ui stays free of react-intl and of
// any app's message dictionaries. Keeps existing PageError imports working.
// Use onRetry={refetch} from TanStack Query to re-trigger the failed request.

import { FormattedMessage } from 'react-intl';
import { ErrorState } from '@plexica/ui';

interface PageErrorProps {
  onRetry?: () => void;
}

export function PageError({ onRetry }: PageErrorProps): JSX.Element {
  return (
    <ErrorState
      heading={<FormattedMessage id="error.page.heading" />}
      description={<FormattedMessage id="error.page.description" />}
      retryLabel={<FormattedMessage id="common.retry" />}
      onRetry={onRetry}
    />
  );
}
