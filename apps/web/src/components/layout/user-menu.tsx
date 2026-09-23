// user-menu.tsx
// Radix DropdownMenu triggered by Avatar.
// Shows user name, email, separator, and Sign out action.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut } from 'lucide-react';
import { useIntl } from 'react-intl';

import { useAuthStore } from '../../stores/auth-store.js';

import { Avatar } from './avatar.js';

interface UserMenuProps {
  /** Server-resolved avatar URL (006-12) — Keycloak `picture` claim wins. */
  avatarUrl?: string | undefined;
  /**
   * Refreshed profile email (006-11). The auth-store email comes from the
   * access token and goes stale after an email edit until the next login;
   * the profile query is invalidated on save, so prefer it when available.
   */
  email?: string | undefined;
}

export function UserMenu({ avatarUrl, email }: UserMenuProps): JSX.Element {
  const intl = useIntl();
  const userProfile = useAuthStore((s) => s.userProfile);
  const logout = useAuthStore((s) => s.logout);

  const name =
    userProfile !== null ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : '…';
  const shownEmail = email ?? userProfile?.email;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={name}
          data-testid="user-menu-trigger"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          <Avatar
            name={name}
            size="sm"
            {...(avatarUrl !== undefined ? { imageUrl: avatarUrl } : {})}
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[200px] rounded-md border border-neutral-200 bg-white p-1 shadow-lg"
        >
          {/* User info — non-interactive */}
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium text-neutral-900">{name}</p>
            {shownEmail !== undefined && <p className="text-xs text-neutral-500">{shownEmail}</p>}
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />

          <DropdownMenu.Item
            onSelect={() => {
              void logout();
            }}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-700 outline-none hover:bg-neutral-50 focus:bg-neutral-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {intl.formatMessage({ id: 'user.menu.signOut' })}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
