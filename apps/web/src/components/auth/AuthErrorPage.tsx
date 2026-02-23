// apps/web/src/components/auth/AuthErrorPage.tsx
//
// Full-screen error layout for authentication failures.
// Covers Screen 4 (Tenant Not Found), Screen 5 (Tenant Suspended),
// and Screen 8 (Keycloak Unavailable).
// role="alert" ensures immediate announcement by screen readers.

import { ShieldAlert, ServerCrash, SearchX } from 'lucide-react';
import { Button } from '@plexica/ui';

export type AuthErrorVariant = 'not-found' | 'suspended' | 'keycloak-error';

interface AuthErrorPageProps {
  variant: AuthErrorVariant;
  /** Tenant slug to display in monospace for not-found case */
  slug?: string;
  /** Tenant logo URL (shown if available from cache) */
  tenantLogoUrl?: string | null;
  /** Whether to show a Retry button (keycloak-error only) */
  showRetry?: boolean;
  onRetry?: () => void;
}

const VARIANTS: Record<
  AuthErrorVariant,
  {
    icon: React.ReactNode;
    heading: string;
    description: (slug?: string) => string;
    color: string;
  }
> = {
  'not-found': {
    icon: <SearchX className="w-12 h-12" aria-hidden="true" />,
    heading: 'Tenant not found',
    description: (slug) =>
      slug
        ? `No workspace was found for "${slug}". Check the URL and try again.`
        : 'No workspace was found for this URL. Check the address and try again.',
    color: 'text-muted-foreground',
  },
  suspended: {
    icon: <ShieldAlert className="w-12 h-12" aria-hidden="true" />,
    heading: 'Account suspended',
    description: () =>
      'This workspace has been suspended. Contact your administrator for assistance.',
    color: 'text-destructive',
  },
  'keycloak-error': {
    icon: <ServerCrash className="w-12 h-12" aria-hidden="true" />,
    heading: 'Authentication service unavailable',
    description: () => 'We could not reach the authentication service. This is usually temporary.',
    color: 'text-destructive',
  },
};

export function AuthErrorPage({
  variant,
  slug,
  tenantLogoUrl,
  showRetry = false,
  onRetry,
}: AuthErrorPageProps) {
  const { icon, heading, description, color } = VARIANTS[variant];

  return (
    <div
      role="alert"
      aria-label={heading}
      className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[var(--auth-bg-gradient-from)] to-[var(--auth-bg-gradient-to)] px-4"
    >
      <div className="w-full max-w-md text-center space-y-6">
        {/* Optional tenant logo */}
        {tenantLogoUrl && (
          <div className="flex justify-center">
            <img src={tenantLogoUrl} alt="Workspace logo" className="h-12 w-auto object-contain" />
          </div>
        )}

        {/* Icon */}
        <div className={`flex justify-center ${color}`}>{icon}</div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-foreground">{heading}</h1>

        {/* Description */}
        <p className="text-muted-foreground">{description(slug)}</p>

        {/* Slug display for not-found */}
        {variant === 'not-found' && slug && (
          <p className="text-sm text-muted-foreground">
            Requested workspace:{' '}
            <code className="font-mono bg-muted px-2 py-0.5 rounded text-foreground">{slug}</code>
          </p>
        )}

        {/* Retry button (keycloak-error only) */}
        {showRetry && onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            aria-label="Retry connection to authentication service"
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
