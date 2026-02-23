// apps/web/src/routes/auth/error.tsx
//
// Auth error page route — Screens 4–5 (via AuthErrorPage component).
// Renders the appropriate error variant based on ?code= query param.

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AuthErrorPage, type AuthErrorVariant } from '@/components/auth/AuthErrorPage';
import { getTenantFromUrl } from '@/lib/tenant';

export const Route = createFileRoute('/auth/error')({
  component: AuthErrorRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search['code'] === 'string' ? search['code'] : 'AUTH_ERROR',
  }),
});

/** Map backend/OAuth error codes to AuthErrorPage variants */
function codeToVariant(code: string): AuthErrorVariant {
  if (code === 'TENANT_NOT_FOUND') return 'not-found';
  if (code === 'AUTH_TENANT_SUSPENDED') return 'suspended';
  return 'keycloak-error';
}

function AuthErrorRoute() {
  const navigate = useNavigate();
  const { code } = Route.useSearch();
  const tenantSlug = getTenantFromUrl();
  const variant = codeToVariant(code);

  const handleRetry = () => {
    navigate({ to: '/login', replace: true });
  };

  return (
    <AuthErrorPage
      variant={variant}
      slug={variant === 'not-found' ? tenantSlug : undefined}
      showRetry={variant === 'keycloak-error'}
      onRetry={handleRetry}
    />
  );
}
