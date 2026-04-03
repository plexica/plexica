// auth-guard.tsx
// Route guard — redirects unauthenticated users to Keycloak login.
// Renders children once authenticated; shows nothing while redirecting.
//
// NEW-H-2: Only redirect when status === 'unauthenticated'.
// When status === 'expired', SessionExpiredHandler owns the flow:
// it shows a 3-second toast (EC-05) before calling login(). Triggering
// login() here would race against and beat that handler.

import { useEffect } from 'react';

import { useAuthStore } from '../../stores/auth-store.js';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps): JSX.Element | null {
  const status = useAuthStore((s) => s.status);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    // Only redirect for genuinely unauthenticated users.
    // 'expired' sessions are handled by SessionExpiredHandler (3s toast → redirect).
    if (status === 'unauthenticated') {
      void login();
    }
  }, [status, login]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
