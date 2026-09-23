// password-card.tsx
// Password change card (006-14): external link into the per-realm Keycloak
// account console. A plain anchor (not a router Link) — the console is an
// external destination; target _blank + rel keep the app session intact.
// All strings via react-intl; Lucide icon only.

import { ExternalLink } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import { Button } from '@plexica/ui';

import { SettingsSection } from '../settings/settings-section.js';

interface PasswordCardProps {
  accountUrl: string;
}

export function PasswordCard({ accountUrl }: PasswordCardProps): JSX.Element {
  return (
    <SettingsSection
      title={<FormattedMessage id="profile.password.title" />}
      description={<FormattedMessage id="profile.password.description" />}
    >
      <Button asChild>
        <a href={accountUrl} target="_blank" rel="noreferrer" data-testid="password-change-link">
          <FormattedMessage id="profile.password.button" />
          <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
        </a>
      </Button>
    </SettingsSection>
  );
}
