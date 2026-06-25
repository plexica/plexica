// role-options.ts
// Shared role option definitions with i18n support.
// Single source of truth for workspace role labels across the app.

import type { IntlShape } from 'react-intl';
import type { SelectOption } from '@plexica/ui';

export function getRoleOptions(intl: IntlShape): SelectOption[] {
  return [
    { value: 'admin', label: intl.formatMessage({ id: 'members.role.admin' }) },
    { value: 'member', label: intl.formatMessage({ id: 'members.role.member' }) },
    { value: 'viewer', label: intl.formatMessage({ id: 'members.role.viewer' }) },
  ];
}
