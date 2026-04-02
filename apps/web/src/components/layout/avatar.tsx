// avatar.tsx
// Wraps Radix Avatar with initials fallback.
// Sizes: sm (32px), md (40px), lg (48px).
// WCAG: aria-label = full name.

import * as RadixAvatar from '@radix-ui/react-avatar';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  name: string;
  imageUrl?: string;
  size?: AvatarSize;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ name, imageUrl, size = 'md' }: AvatarProps): JSX.Element {
  return (
    <RadixAvatar.Root
      className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-primary-100 ${sizeClasses[size]}`}
      aria-label={name}
    >
      {imageUrl !== undefined && (
        <RadixAvatar.Image src={imageUrl} alt={name} className="h-full w-full object-cover" />
      )}
      <RadixAvatar.Fallback
        className="flex items-center justify-center font-medium text-primary-700"
        delayMs={600}
      >
        {getInitials(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
