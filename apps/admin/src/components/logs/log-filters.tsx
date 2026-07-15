// log-filters.tsx — Filter bar for the System Logs Viewer (S5-A04).
// Tenant text input + level select + limit select + explicit Search button.
// No auto-search: Loki queries are expensive (design-spec Screen 12).
// All strings via react-intl; controls have aria-labels (WCAG 4.1.2).

import { FormattedMessage, useIntl } from 'react-intl';
import { Search } from 'lucide-react';
import { Button, Input, Select } from '@plexica/ui';

export type LogLevelFilter = 'all' | 'debug' | 'info' | 'warn' | 'error';
export type LogLimit = 50 | 100 | 200 | 500;

export interface LogFilterValues {
  tenant: string;
  level: LogLevelFilter;
  limit: LogLimit;
}

interface LogFiltersProps {
  values: LogFilterValues;
  onTenantChange: (tenant: string) => void;
  onLevelChange: (level: LogLevelFilter) => void;
  onLimitChange: (limit: LogLimit) => void;
  onSearch: () => void;
  onClear: () => void;
  loading: boolean;
}

export function LogFilters({
  values, onTenantChange, onLevelChange, onLimitChange, onSearch, onClear, loading,
}: LogFiltersProps): JSX.Element {
  const intl = useIntl();

  const levelOptions = [
    { value: 'all', label: intl.formatMessage({ id: 'admin.logs.filter.levelAll' }) },
    { value: 'debug', label: intl.formatMessage({ id: 'admin.logs.level.debug' }) },
    { value: 'info', label: intl.formatMessage({ id: 'admin.logs.level.info' }) },
    { value: 'warn', label: intl.formatMessage({ id: 'admin.logs.level.warn' }) },
    { value: 'error', label: intl.formatMessage({ id: 'admin.logs.level.error' }) },
  ];

  const limitOptions = [50, 100, 200, 500].map((n) => ({
    value: String(n),
    label: String(n),
  }));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-56">
        <Input
          type="text"
          value={values.tenant}
          onChange={(e) => onTenantChange(e.target.value)}
          placeholder={intl.formatMessage({ id: 'admin.logs.filter.tenantPlaceholder' })}
          aria-label={intl.formatMessage({ id: 'admin.logs.filter.tenant' })}
        />
      </div>

      <div className="w-40">
        <Select
          options={levelOptions}
          value={values.level}
          onValueChange={(v) => onLevelChange(v as LogLevelFilter)}
          aria-label={intl.formatMessage({ id: 'admin.logs.filter.level' })}
        />
      </div>

      <div className="w-32">
        <Select
          options={limitOptions}
          value={String(values.limit)}
          onValueChange={(v) => onLimitChange(Number(v) as LogLimit)}
          aria-label={intl.formatMessage({ id: 'admin.logs.filter.limit' })}
        />
      </div>

      <Button type="button" variant="primary" onClick={onSearch} loading={loading}>
        <Search className="h-4 w-4" aria-hidden="true" />
        <FormattedMessage id="admin.logs.search" />
      </Button>

      <Button type="button" variant="outline" onClick={onClear} disabled={loading}>
        <FormattedMessage id="admin.logs.clear" />
      </Button>
    </div>
  );
}
