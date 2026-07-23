import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Badge } from '@plexica/ui';

import { fetchDealCount } from './api';

import type { CrmApiContext } from './api';

export function DealListBadge(context: CrmApiContext): React.JSX.Element {
  const intl = useIntl();
  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'deals', 'count', context.workspaceId],
    queryFn: () => fetchDealCount(context),
  });

  return (
    <button
      type="button"
      className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
      aria-label={intl.formatMessage({ id: 'crm.sidebar.dealsLabel' })}
    >
      <span>{intl.formatMessage({ id: 'crm.sidebar.deals' })}</span>
      {!isLoading && data && (
        <Badge variant="default" label={String(data.count)} />
      )}
    </button>
  );
}
