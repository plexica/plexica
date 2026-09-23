// avatar-header.tsx
// Profile identity header (006-12): large avatar, display name, and email.
// The avatar URL is server-resolved — the Keycloak JWT `picture` claim wins
// over the upload — so preferring `avatarUrl` IS preferring the Keycloak
// source; the note below names which source is active. No hardcoded strings.

import { FormattedMessage } from 'react-intl';

import { Avatar } from '../layout/avatar.js';

import type { UserProfileDto } from '../../types/profile.js';

interface AvatarHeaderProps {
  profile: UserProfileDto;
}

export function AvatarHeader({ profile }: AvatarHeaderProps): JSX.Element {
  const name = profile.displayName ?? profile.email;
  return (
    <div className="flex items-center gap-4" data-testid="profile-avatar-header">
      <Avatar
        name={name}
        size="lg"
        {...(profile.avatarUrl !== null ? { imageUrl: profile.avatarUrl } : {})}
      />
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold text-neutral-900">{name}</p>
        <p className="truncate text-sm text-neutral-500">{profile.email}</p>
        <p className="mt-0.5 text-xs text-neutral-400">
          <FormattedMessage
            id={
              profile.avatarSource === 'keycloak'
                ? 'profile.avatar.source.keycloak'
                : 'profile.avatar.source.upload'
            }
          />
        </p>
      </div>
    </div>
  );
}
