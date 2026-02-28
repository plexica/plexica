// apps/web/src/components/AuthWarningBanner.tsx
//
// T005-17: Displays a dismissible warning banner when silent token refresh has
// failed.  Gated by the ENABLE_AUTH_WARNING_BANNER feature flag so it can be
// rolled out incrementally (Constitution Art. 9.1).
//
// The banner is intentionally non-blocking — the user can dismiss it and keep
// working.  Pressing "Refresh" triggers another token-refresh attempt.

import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@plexica/ui';
import { useFeatureFlag } from '@/lib/feature-flags';
import { useAuthStore } from '@/stores/auth.store';

export function AuthWarningBanner() {
  const isEnabled = useFeatureFlag('ENABLE_AUTH_WARNING_BANNER');
  const refreshFailed = useAuthStore((s) => s.refreshFailed);
  const setRefreshFailed = useAuthStore((s) => s.setRefreshFailed);
  const refreshTokens = useAuthStore((s) => s.refreshTokens);

  // Hidden when flag is off or no refresh failure has occurred
  if (!isEnabled || !refreshFailed) {
    return null;
  }

  function handleDismiss() {
    setRefreshFailed(false);
  }

  async function handleRefresh() {
    await refreshTokens();
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="auth-warning-banner"
      className="flex items-center gap-3 px-4 py-3 bg-warning/10 border-b border-warning/30 text-warning-foreground"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />

      <p className="flex-1 text-sm">
        Your session may have expired. Please save your work and refresh the page.
      </p>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          data-testid="auth-warning-refresh-btn"
        >
          Refresh
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          aria-label="Dismiss session warning"
          data-testid="auth-warning-dismiss-btn"
          className="w-8 h-8 p-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
