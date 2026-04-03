// session-expired-handler.tsx
// Subscribes to auth store status; shows a toast and auto-redirects when session expires.

import { useEffect } from 'react';
import { useIntl } from 'react-intl';

import { useAuthStore } from '../../stores/auth-store.js';

// L-5: design-spec Screen 5 specifies 3 seconds. Aligns document and code.
const REDIRECT_DELAY_MS = 3_000;

export function SessionExpiredHandler(): JSX.Element | null {
  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);
  const setSessionExpired = useAuthStore((s) => s.dismissExpired);
  const intl = useIntl();

  useEffect(() => {
    if (status !== 'expired') return;

    // NEW-L-2: document.title manipulation removed — it is not a meaningful
    // notification mechanism. The role="alert" banner below already provides
    // the correct accessible notification to screen readers and users.
    const timer = setTimeout(() => {
      void login();
    }, REDIRECT_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [status, login]); // intl removed — only used in JSX, not inside the effect body

  if (status !== 'expired') return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-4 right-4 z-50 rounded-md bg-amber-500 px-4 py-3 text-sm text-neutral-900 shadow-lg"
    >
      <p>{intl.formatMessage({ id: 'auth.session.expired' })}</p>
      <p>{intl.formatMessage({ id: 'auth.session.redirecting' })}</p>
      <button
        type="button"
        aria-label={intl.formatMessage({ id: 'auth.session.dismiss' })}
        className="mt-2 underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        onClick={() => {
          setSessionExpired();
        }}
      >
        {intl.formatMessage({ id: 'auth.session.dismiss' })}
      </button>
    </div>
  );
}
