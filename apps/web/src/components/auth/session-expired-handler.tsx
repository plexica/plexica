// session-expired-handler.tsx
// Subscribes to auth store status; shows a toast and auto-redirects when session expires.
// Uses the shared Toast from @plexica/ui (Radix-based, design-token warning
// variant) instead of a hand-rolled banner. ToastProvider/ToastViewport are
// mounted in main.tsx. role="alert" is forwarded onto the visible toast so
// screen readers (and the session-expiry E2E spec) keep the alert semantics.

import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import { Toast } from '@plexica/ui';

import { clearAuthQueryCache } from '../../services/auth-query-cache.js';
import { useAuthStore } from '../../stores/auth-store.js';

// L-5: design-spec Screen 5 specifies 3 seconds. Aligns document and code.
const REDIRECT_DELAY_MS = 3_000;
// The toast is controlled by auth status, not by its auto-close timer; the
// long duration only acts as a fallback so auto-close never races the redirect.
const TOAST_DURATION_MS = 60_000;

export function SessionExpiredHandler(): JSX.Element | null {
  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);
  const dismissExpired = useAuthStore((s) => s.dismissExpired);
  const intl = useIntl();

  useEffect(() => {
    if (status !== 'expired') return;
    clearAuthQueryCache();

    // NEW-L-2: document.title manipulation removed — it is not a meaningful
    // notification mechanism. The role="alert" toast below already provides
    // the correct accessible notification to screen readers and users.
    const timer = setTimeout(() => {
      void login().catch(() => {
        window.location.href = '/login';
      });
    }, REDIRECT_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [status, login]); // intl removed — only used in JSX, not inside the effect body

  return (
    <Toast
      variant="warning"
      type="foreground"
      role="alert"
      open={status === 'expired'}
      duration={TOAST_DURATION_MS}
      onOpenChange={(open) => {
        // User-initiated close (X button, Escape, swipe) dismisses the expired
        // state, which cancels the redirect via the effect cleanup above.
        // Guard on the live status so a late auto-close can never clobber a
        // login flow that has already moved past 'expired'.
        if (!open && useAuthStore.getState().status === 'expired') {
          dismissExpired();
        }
      }}
      title={intl.formatMessage({ id: 'auth.session.expired' })}
      description={intl.formatMessage({ id: 'auth.session.redirecting' })}
      closeLabel={intl.formatMessage({ id: 'auth.session.dismiss' })}
    />
  );
}
