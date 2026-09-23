// sessions-card.tsx
// Active SSO sessions card (006-13): lists the caller's Keycloak sessions with
// per-session revoke buttons. Self-contained TanStack Query data flow — the
// page only mounts it. Revoking the current session signs the user out (the
// Keycloak-side session is gone, so the next refresh would 401). All strings
// via react-intl; Lucide icons only.

import { MonitorSmartphone } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@plexica/ui';

import { useRevokeSession, useSessions } from '../../hooks/use-sessions.js';
import { SettingsSection } from '../settings/settings-section.js';

import type { UserSession } from '../../types/profile.js';

function SessionRow({
  session,
  revoking,
  onRevoke,
}: {
  session: UserSession;
  revoking: boolean;
  onRevoke: (input: { id: string; current: boolean }) => void;
}): JSX.Element {
  const intl = useIntl();
  const lastSeen = intl.formatDate(new Date(session.lastSeenAt), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <li
      data-testid="session-item"
      data-current={session.current ? 'true' : 'false'}
      className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2.5"
    >
      <MonitorSmartphone className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900">
          {session.clientId}
          {session.current && (
            <span className="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
              <FormattedMessage id="profile.sessions.current" />
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          <FormattedMessage id="profile.sessions.lastSeen" values={{ date: lastSeen }} />
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        loading={revoking}
        disabled={revoking}
        onClick={() => onRevoke({ id: session.id, current: session.current })}
        aria-label={intl.formatMessage({ id: 'profile.sessions.revoke' })}
        className="shrink-0"
      >
        <FormattedMessage id="profile.sessions.revoke" />
      </Button>
    </li>
  );
}

export function SessionsCard(): JSX.Element {
  const { data, isPending, isError, refetch } = useSessions();
  const {
    mutate: revoke,
    isPending: isRevoking,
    isError: isRevokeError,
    variables: revokingInput,
  } = useRevokeSession();

  return (
    <SettingsSection
      title={<FormattedMessage id="profile.sessions.title" />}
      description={<FormattedMessage id="profile.sessions.description" />}
    >
      {isPending && (
        <p className="text-sm text-neutral-500" aria-busy="true" aria-live="polite">
          <FormattedMessage id="skeleton.loading" />
        </p>
      )}
      {isError && (
        <div className="space-y-2">
          <p className="text-sm text-red-600" role="alert">
            <FormattedMessage id="profile.sessions.error" />
          </p>
          <Button variant="ghost" size="sm" onClick={() => void refetch()}>
            <FormattedMessage id="common.retry" />
          </Button>
        </div>
      )}
      {isRevokeError && (
        <p className="text-sm text-red-600" role="alert">
          <FormattedMessage id="profile.sessions.revokeError" />
        </p>
      )}
      {data !== undefined && data.sessions.length === 0 && (
        <p className="text-sm text-neutral-500">
          <FormattedMessage id="profile.sessions.empty" />
        </p>
      )}
      {data !== undefined && data.sessions.length > 0 && (
        <ul className="space-y-2">
          {data.sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              revoking={isRevoking && revokingInput?.id === session.id}
              onRevoke={(input) => revoke(input)}
            />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
